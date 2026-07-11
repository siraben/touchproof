import { assertAxiomFree, check, definitionallyEqual, type Context, type Environment } from "../kernel/checker.js";
import {
  app,
  apps,
  arrow,
  constant,
  equal,
  lambda,
  pi,
  recursor,
  refl,
  type,
  variable,
  type Term,
} from "../kernel/term.js";
import { allExpressions, expressionEqual, replaceById, type Expr } from "./ast.js";
import { applicationSpine } from "../kernel/term.js";
import { cat, fill, group, line, nest, render, text, type Doc } from "./doc.js";
import { inductiveByName } from "./inductives.js";
import { decodeProofSession } from "./protocol.js";
import { touchProofEnvironment } from "./standardLibrary.js";
import {
  instantiateHypothesis,
  isPropositionGoal,
  type EquationGoal,
  type Hypothesis,
  type ProofGoal,
  type ProofSession,
  type ProofStep,
  type PropositionGoal,
} from "./session.js";

const lemmaNames: Readonly<Record<string, string>> = {
  append_nil: "append_nil_right",
  append_assoc: "append_assoc",
  rev_append: "rev_append",
  add_zero_right: "add_zero_right",
  add_succ_right: "add_succ_right",
  add_one_right: "add_one_right",
  length_append: "length_append",
};

function valueType(source: string): Term {
  if (source === "Bool") return constant("Bool");
  if (source === "Nat") return constant("Nat");
  if (source.startsWith("List")) return constant("List");
  if (source.includes("→")) return arrow(constant("Elem"), constant("Elem"));
  return constant("Elem");
}

interface Binder {
  readonly name: string;
  readonly type: Term;
}

function binders(entries: readonly string[]): Binder[] {
  return entries.flatMap((entry) => {
    const separator = entry.indexOf(":");
    if (separator < 1) throw new Error(`invalid kernel binding ${entry}`);
    const sourceType = entry.slice(separator + 1).trim();
    if (sourceType === "Type") return [];
    // Propositional atoms are honest kernel binders: `Prop` is displayed, the
    // predicative `Type 0` is what the kernel checks (there is no impredicative sort).
    const binderType = sourceType === "Prop" ? type(0) : valueType(sourceType);
    return entry.slice(0, separator).split(",").map((name) => ({ name: name.trim(), type: binderType }));
  });
}

function expressionTerm(expr: Expr, targetId?: string, replacement?: Term): Term {
  if (targetId !== undefined && expr.id === targetId) {
    if (replacement === undefined) throw new Error("a replacement term is required");
    return replacement;
  }
  if (expr.kind === "var") return variable(expr.name);
  const args = expr.args.map((argument) => expressionTerm(argument, targetId, replacement));
  if (expr.kind === "call" && expr.name === "apply") {
    if (args.length !== 2) throw new Error("apply has the wrong arity");
    return app(args[0]!, args[1]!);
  }
  return apps(constant(expr.name), ...args);
}

function equalityType(goal: EquationGoal, left: Expr, right: Expr): Term {
  return equal(valueType(goal.type), expressionTerm(left), expressionTerm(right));
}

function localContext(goal: EquationGoal): Context {
  const context = new Map<string, Term>();
  for (const binder of binders(goal.context)) context.set(binder.name, binder.type);
  for (const hypothesis of goal.hypotheses) {
    const proposition = equalityType(goal, hypothesis.left, hypothesis.right);
    const hypothesisType = (hypothesis.binders ?? []).reduceRight(
      (result, binder) => pi(binder.name, valueType(binder.type), result),
      proposition,
    );
    context.set(hypothesis.name, hypothesisType);
  }
  return context;
}

function symm(type: Term, left: Term, right: Term, proof: Term): Term {
  return apps(constant("eq_symm"), type, left, right, proof);
}

function trans(type: Term, left: Term, middle: Term, right: Term, first: Term, second: Term): Term {
  return apps(constant("eq_trans"), type, left, middle, right, first, second);
}

function congr(type: Term, fn: Term, left: Term, right: Term, proof: Term): Term {
  return apps(constant("congr_arg"), type, type, fn, left, right, proof);
}

function hypothesisProof(hypothesis: Hypothesis): Term {
  if (hypothesis.id.startsWith("ih-")) return variable(hypothesis.name);
  if (hypothesis.name === "append_nil" && hypothesis.left.kind === "call") {
    return app(constant("append_nil_right"), expressionTerm(hypothesis.left.args[0]!));
  }
  if (hypothesis.name === "append_assoc" && hypothesis.left.kind === "call") {
    const nested = hypothesis.left.args[0];
    if (nested?.kind === "call") {
      return apps(
        constant("append_assoc"),
        expressionTerm(nested.args[0]!),
        expressionTerm(nested.args[1]!),
        expressionTerm(hypothesis.left.args[1]!),
      );
    }
  }
  if (hypothesis.name === "rev_append" && hypothesis.left.kind === "call") {
    const appended = hypothesis.left.args[0];
    if (appended?.kind === "call") {
      return apps(constant("rev_append"), expressionTerm(appended.args[0]!), expressionTerm(appended.args[1]!));
    }
  }
  // add_zero_right (n)     from  add(n, zero) = n
  // add_one_right (n)      from  add(n, succ(zero)) = succ(n)
  if ((hypothesis.name === "add_zero_right" || hypothesis.name === "add_one_right") && hypothesis.left.kind === "call") {
    return app(constant(hypothesis.name), expressionTerm(hypothesis.left.args[0]!));
  }
  // add_succ_right (m) (n)  from  add(m, succ(n)) = succ(add(m, n))
  if (hypothesis.name === "add_succ_right" && hypothesis.left.kind === "call") {
    const successor = hypothesis.left.args[1];
    if (successor?.kind === "ctor") {
      return apps(constant("add_succ_right"), expressionTerm(hypothesis.left.args[0]!), expressionTerm(successor.args[0]!));
    }
  }
  // length_append (as) (bs)  from  length(append(as, bs)) = add(length(as), length(bs))
  if (hypothesis.name === "length_append" && hypothesis.left.kind === "call") {
    const appended = hypothesis.left.args[0];
    if (appended?.kind === "call") {
      return apps(constant("length_append"), expressionTerm(appended.args[0]!), expressionTerm(appended.args[1]!));
    }
  }
  return constant(lemmaNames[hypothesis.name] ?? hypothesis.name);
}

function rewriteProof(goal: EquationGoal, before: Expr, after: Expr, reason: string): Term | undefined {
  const name = reason.slice("rewrite with ".length);
  const hypothesis = goal.hypotheses.find((candidate) => candidate.name === name);
  if (hypothesis === undefined) return undefined;
  for (const occurrence of allExpressions(before)) {
    const replacement = instantiateHypothesis(hypothesis, occurrence);
    if (replacement === undefined || !expressionEqual(replaceById(before, occurrence.id, replacement), after)) continue;
    const instantiatedArguments = generalizedArguments(hypothesis, occurrence);
    if (instantiatedArguments === undefined) continue;
    const type = valueType(goal.type);
    const hole = variable("__rewrite_hole");
    const contextFunction = lambda("__rewrite_hole", type, expressionTerm(before, occurrence.id, hole));
    return congr(
      type,
      contextFunction,
      expressionTerm(occurrence),
      expressionTerm(replacement),
      apps(hypothesisProof(hypothesis), ...instantiatedArguments),
    );
  }
  return undefined;
}

function generalizedArguments(hypothesis: Hypothesis, target: Expr): readonly Term[] | undefined {
  const names = new Set(hypothesis.binders?.map((binder) => binder.name) ?? []);
  const bindings = new Map<string, Expr>();
  const match = (pattern: Expr, value: Expr): boolean => {
    if (pattern.kind === "var" && names.has(pattern.name)) {
      const previous = bindings.get(pattern.name);
      if (previous === undefined) bindings.set(pattern.name, value);
      return previous === undefined || expressionEqual(previous, value);
    }
    if (pattern.kind !== value.kind || pattern.name !== value.name) return false;
    if (pattern.kind === "var" || value.kind === "var") return true;
    return pattern.args.length === value.args.length
      && pattern.args.every((child, index) => match(child, value.args[index]!));
  };
  if (!match(hypothesis.left, target)) return undefined;
  return (hypothesis.binders ?? []).map((binder) => expressionTerm(bindings.get(binder.name) ?? variableExpression(binder.name)));
}

function variableExpression(name: string): Expr {
  return { id: `certificate-${name}`, kind: "var", name };
}

function transitionProof(goal: EquationGoal, before: Expr, after: Expr, next: ProofStep, environment: Environment): Term {
  const type = valueType(goal.type);
  if (next.reason.startsWith("rewrite with ")) {
    const proof = rewriteProof(goal, before, after, next.reason);
    if (proof === undefined) throw new Error(`cannot reconstruct ${next.reason}`);
    return proof;
  }
  const proof = refl(expressionTerm(before));
  check(proof, equal(type, expressionTerm(before), expressionTerm(after)), localContext(goal), environment);
  return proof;
}

function chain(
  goal: EquationGoal,
  side: "left" | "right",
  environment: Environment,
): { readonly first: Term; readonly last: Term; readonly proof: Term } {
  const states = goal.steps.filter((step, index) => index === 0
    || !expressionEqual(step[side], goal.steps[index - 1]![side]));
  const first = expressionTerm(states[0]![side]);
  let last = first;
  let proof: Term = refl(first);
  const type = valueType(goal.type);
  for (let index = 1; index < states.length; index += 1) {
    const beforeExpr = states[index - 1]![side];
    const afterExpr = states[index]![side];
    const after = expressionTerm(afterExpr);
    const step = transitionProof(goal, beforeExpr, afterExpr, states[index]!, environment);
    proof = trans(type, first, last, after, proof, step);
    last = after;
  }
  return { first, last, proof };
}

function goalProof(goal: EquationGoal, environment: Environment): Term {
  if (goal.status !== "solved") throw new Error(`obligation ${goal.label} is still open`);
  const left = chain(goal, "left", environment);
  const right = chain(goal, "right", environment);
  if (!definitionallyEqual(left.last, right.last, environment)) {
    throw new Error(`obligation ${goal.label} does not finish by reflexivity`);
  }
  const type = valueType(goal.type);
  const proof = trans(
    type,
    left.first,
    left.last,
    right.first,
    left.proof,
    trans(type, left.last, right.last, right.first, refl(left.last), symm(type, right.first, right.last, right.proof)),
  );
  check(proof, equal(type, left.first, right.first), localContext(goal), environment);
  return proof;
}

function validateOpenGoal(goal: EquationGoal, environment: Environment): void {
  const context = localContext(goal);
  const expectedType = valueType(goal.type);
  for (const step of goal.steps) {
    check(expressionTerm(step.left), expectedType, context, environment);
    check(expressionTerm(step.right), expectedType, context, environment);
  }
  chain(goal, "left", environment);
  chain(goal, "right", environment);
}

function wrapLambdas(items: readonly Binder[], body: Term): Term {
  return items.reduceRight((result, binder) => lambda(binder.name, binder.type, result), body);
}

function wrapPis(items: readonly Binder[], body: Term): Term {
  return items.reduceRight((result, binder) => pi(binder.name, binder.type, result), body);
}

function goalById(session: ProofSession, goalId: string): ProofGoal {
  const found = session.goals.find((goal) => goal.id === goalId)
    ?? session.ancestors.find((goal) => goal.id === goalId);
  if (found === undefined) throw new Error(`unknown proof obligation ${goalId}`);
  return found;
}

function equationGoalById(session: ProofSession, goalId: string): EquationGoal {
  const found = goalById(session, goalId);
  if (isPropositionGoal(found)) throw new Error(`obligation ${goalId} is not an equation`);
  return found;
}

function propositionGoalById(session: ProofSession, goalId: string): PropositionGoal {
  const found = goalById(session, goalId);
  if (!isPropositionGoal(found)) throw new Error(`obligation ${goalId} is not a proposition`);
  return found;
}

/** The goal's generalized variables as kernel binders, in generalization order. */
function generalizedBinders(goal: EquationGoal): Binder[] {
  const available = binders(goal.context);
  return goal.generalized.map((name) => {
    const found = available.find((binder) => binder.name === name);
    if (found === undefined) throw new Error(`cannot generalize unknown variable ${name}`);
    return found;
  });
}

/** Whether `name` occurs free in the hypothesis (its own binders shadow). */
function hypothesisMentionsFree(hypothesis: Hypothesis, name: string): boolean {
  if (hypothesis.binders?.some((binder) => binder.name === name) === true) return false;
  return [...allExpressions(hypothesis.left), ...allExpressions(hypothesis.right)]
    .some((expr) => expr.kind === "var" && expr.name === name);
}

/** The kernel type of a hypothesis with the analyzed variable renamed to the motive value. */
function hypothesisBinderType(type: Term, hypothesis: Hypothesis, variable?: string): Term {
  const left = variable === undefined ? hypothesis.left : replaceProgramVariable(hypothesis.left, variable);
  const right = variable === undefined ? hypothesis.right : replaceProgramVariable(hypothesis.right, variable);
  const proposition = equal(type, expressionTerm(left), expressionTerm(right));
  return (hypothesis.binders ?? []).reduceRight(
    (result, binder) => pi(binder.name, valueType(binder.type), result),
    proposition,
  );
}

/**
 * Proof term for a goal-tree node. A leaf is the classic transition chain
 * ending in reflexivity. A split goal composes recursively: its pre-split
 * chains are stitched (via eq_trans) around a recursor whose motive abstracts
 * the analyzed variable out of the split-time equation — and, destruct-style,
 * out of every hypothesis that freely mentions it: those hypotheses are
 * reverted into the motive as Π-binders and the recursor's result is applied
 * back to their proofs, so each branch receives the INSTANTIATED hypothesis
 * (matching what the session shows). Branch terms bind the freshened
 * constructor fields, an induction hypothesis for every recursive field
 * (unused for mere case analyses), the generalized binders, and the reverted
 * hypotheses — each branch body being this function on the child obligation.
 */
function goalTreeProof(session: ProofSession, goal: EquationGoal, environment: Environment): Term {
  if (goal.analysis === undefined) return goalProof(goal, environment);
  const analysis = goal.analysis;
  const inductive = inductiveByName(analysis.type);
  if (inductive === undefined || analysis.branches.length !== inductive.constructors.length) {
    throw new Error("invalid analysis branches");
  }
  const type = valueType(goal.type);
  const generalized = generalizedBinders(goal);
  const reverted = goal.hypotheses.filter((hypothesis) => hypothesisMentionsFree(hypothesis, analysis.variable));
  const revertedBinders = reverted.map((hypothesis): Binder => ({
    name: hypothesis.name,
    type: hypothesisBinderType(type, hypothesis, analysis.variable),
  }));
  const motiveBody = equal(
    type,
    expressionTerm(replaceProgramVariable(goal.left, analysis.variable)),
    expressionTerm(replaceProgramVariable(goal.right, analysis.variable)),
  );
  const typedMotive = lambda(
    "__motive_value",
    constant(analysis.type),
    wrapPis([...generalized, ...revertedBinders], motiveBody),
  );
  const branchTerms = analysis.branches.map((branch) => {
    const child = equationGoalById(session, branch.goalId);
    const fields = branch.fields.map((field) => ({ name: field.name, type: valueType(field.type) }));
    // The kernel recursor always binds an induction hypothesis for every
    // recursive field; for a case analysis the binder is simply unused.
    const inductionHypotheses = branch.fields.filter((field) => field.recursive === true).map((field) => ({
      name: (analysis.kind === "induction"
        ? child.hypotheses.find((hypothesis) => hypothesis.id === `ih-${field.name}`)?.name
        : undefined) ?? `__unused_ih_${field.name}`,
      type: app(typedMotive, variable(field.name)),
    }));
    // The instantiated hypotheses, exactly as the child goal carries them.
    const branchReverted = reverted.map((hypothesis): Binder => {
      const instantiated = child.hypotheses.find((candidate) => candidate.id === hypothesis.id);
      if (instantiated === undefined) throw new Error(`missing instantiated hypothesis ${hypothesis.name}`);
      return { name: instantiated.name, type: hypothesisBinderType(type, instantiated) };
    });
    return wrapLambdas(
      [...fields, ...inductionHypotheses, ...generalized, ...branchReverted],
      goalTreeProof(session, child, environment),
    );
  });
  const recursorProof = apps(
    recursor(analysis.type, typedMotive, branchTerms, variable(analysis.variable)),
    ...generalized.map((binder) => variable(binder.name)),
    ...reverted.map((hypothesis) => hypothesisProof(hypothesis)),
  );
  const left = chain(goal, "left", environment);
  const right = chain(goal, "right", environment);
  const proof = trans(
    type,
    left.first,
    left.last,
    right.first,
    left.proof,
    trans(type, left.last, right.last, right.first, recursorProof, symm(type, right.first, right.last, right.proof)),
  );
  check(proof, equal(type, left.first, right.first), localContext(goal), environment);
  return proof;
}

/** The kernel type of a proposition: atoms are context variables of `Type 0`. */
function propositionTerm(expr: Expr): Term {
  if (expr.kind === "var") return variable(expr.name);
  if (expr.name === "imp" && expr.args.length === 2) {
    return arrow(propositionTerm(expr.args[0]!), propositionTerm(expr.args[1]!));
  }
  if (expr.name === "and" && expr.args.length === 2) {
    return apps(constant("and"), propositionTerm(expr.args[0]!), propositionTerm(expr.args[1]!));
  }
  throw new Error(`unsupported proposition ${expr.name}`);
}

/** Hypothesis names bound by this goal's own intro steps (λ-bound in its proof, not ambient). */
function introducedNames(goal: PropositionGoal): Set<string> {
  return new Set(goal.steps
    .filter((step) => step.reason.startsWith("intro "))
    .map((step) => step.reason.slice("intro ".length)));
}

/** The context a proposition goal's proof is checked in: atoms plus the hypotheses present at goal CREATION. */
function propositionContext(goal: PropositionGoal): Context {
  const introduced = introducedNames(goal);
  const context = new Map<string, Term>();
  for (const binder of binders(goal.context)) context.set(binder.name, binder.type);
  for (const hypothesis of goal.hypotheses) {
    if (!introduced.has(hypothesis.name)) context.set(hypothesis.name, propositionTerm(hypothesis.proposition));
  }
  return context;
}

/**
 * Replays a proposition goal's visible steps: every intro is a λ-binder over
 * the implication's antecedent, and a final exact names the hypothesis the
 * goal is closed with. Anything else is rejected.
 */
function propositionChain(goal: PropositionGoal): {
  readonly intros: Binder[];
  readonly exact?: string;
  readonly finalProposition: Expr;
} {
  let current = goal.steps[0]!.proposition;
  const intros: Binder[] = [];
  let exact: string | undefined;
  for (const step of goal.steps.slice(1)) {
    if (exact !== undefined) throw new Error("proposition steps continue past exact");
    if (step.reason.startsWith("intro ")) {
      if (current.kind === "var" || current.name !== "imp") throw new Error("intro requires an implication goal");
      if (!expressionEqual(step.proposition, current.args[1]!)) throw new Error("intro does not match the recorded goal");
      intros.push({ name: step.reason.slice("intro ".length), type: propositionTerm(current.args[0]!) });
      current = step.proposition;
      continue;
    }
    if (step.reason.startsWith("exact ")) {
      if (!expressionEqual(step.proposition, current)) throw new Error("exact does not match the recorded goal");
      const name = step.reason.slice("exact ".length);
      const witness = goal.hypotheses.find((hypothesis) => hypothesis.name === name);
      if (witness === undefined || !expressionEqual(witness.proposition, current)) {
        throw new Error("exact hypothesis does not match the goal");
      }
      exact = name;
      continue;
    }
    throw new Error(`cannot reconstruct ${step.reason}`);
  }
  return { intros, ...(exact === undefined ? {} : { exact }), finalProposition: current };
}

function validatePropositionGoal(goal: PropositionGoal, environment: Environment): void {
  const context = new Map<string, Term>();
  for (const binder of binders(goal.context)) context.set(binder.name, binder.type);
  for (const step of goal.steps) check(propositionTerm(step.proposition), type(0), context, environment);
  propositionChain(goal);
}

/**
 * Proof term for a proposition goal-tree node: the goal's own intro steps
 * become λ-binders around a terminal that is either the exact hypothesis, a
 * (single-branch) `and` recursor for a destruct — whose branch λ-binds the
 * two freshened side hypotheses, matching what the child goal shows — or a
 * `conj` application whose arguments are the split children's proofs.
 */
function propositionGoalTreeProof(session: ProofSession, goal: PropositionGoal, environment: Environment): Term {
  const { intros, exact, finalProposition } = propositionChain(goal);
  let body: Term;
  if (goal.analysis?.kind === "destruct") {
    const hypothesis = goal.hypotheses.find((candidate) => candidate.id === goal.analysis?.hypothesisId);
    if (hypothesis === undefined || hypothesis.proposition.kind === "var" || hypothesis.proposition.name !== "and") {
      throw new Error("destruct requires a conjunction hypothesis");
    }
    const branch = goal.analysis.branches[0];
    if (goal.analysis.branches.length !== 1 || branch === undefined) throw new Error("invalid destruct branches");
    const child = propositionGoalById(session, branch.goalId);
    const sides = goal.hypotheses.filter((candidate) => candidate.id !== hypothesis.id);
    const introduced = child.hypotheses.filter((candidate) => !sides.some((survivor) => survivor.id === candidate.id));
    if (introduced.length !== 2) throw new Error("destruct must introduce exactly two hypotheses");
    const leftTerm = propositionTerm(hypothesis.proposition.args[0]!);
    const rightTerm = propositionTerm(hypothesis.proposition.args[1]!);
    const motive = lambda("__motive_value", apps(constant("and"), leftTerm, rightTerm), propositionTerm(finalProposition));
    const branchTerm = lambda(introduced[0]!.name, leftTerm,
      lambda(introduced[1]!.name, rightTerm, propositionGoalTreeProof(session, child, environment)));
    body = recursor("and", motive, [branchTerm], variable(hypothesis.name), [leftTerm, rightTerm]);
  } else if (goal.analysis?.kind === "split") {
    if (finalProposition.kind === "var" || finalProposition.name !== "and" || goal.analysis.branches.length !== 2) {
      throw new Error("split requires a conjunction goal");
    }
    const [first, second] = goal.analysis.branches;
    body = apps(
      constant("conj"),
      propositionTerm(finalProposition.args[0]!),
      propositionTerm(finalProposition.args[1]!),
      propositionGoalTreeProof(session, propositionGoalById(session, first!.goalId), environment),
      propositionGoalTreeProof(session, propositionGoalById(session, second!.goalId), environment),
    );
  } else {
    if (goal.status !== "solved" || exact === undefined) throw new Error(`obligation ${goal.label} is still open`);
    body = variable(exact);
  }
  const proof = intros.reduceRight<Term>((result, binder) => lambda(binder.name, binder.type, result), body);
  check(proof, propositionTerm(goal.steps[0]!.proposition), propositionContext(goal), environment);
  return proof;
}

function theoremCertificate(session: ProofSession, environment: Environment): { readonly type: Term; readonly term: Term } {
  const theoremBinders = binders(session.theoremContext);
  const root = goalById(session, "goal-root");
  if (isPropositionGoal(root)) {
    if (session.theoremProposition === undefined) throw new Error("the session does not state a proposition");
    return {
      type: wrapPis(theoremBinders, propositionTerm(session.theoremProposition)),
      term: wrapLambdas(theoremBinders, propositionGoalTreeProof(session, root, environment)),
    };
  }
  if (session.theoremLeft === undefined || session.theoremRight === undefined) {
    throw new Error("the session does not state an equation");
  }
  const resultType = valueType(root.type);
  const statement = equal(resultType, expressionTerm(session.theoremLeft), expressionTerm(session.theoremRight));
  return {
    type: wrapPis(theoremBinders, statement),
    term: wrapLambdas(theoremBinders, goalTreeProof(session, root, environment)),
  };
}

function replaceProgramVariable(expr: Expr, name: string): Expr {
  if (expr.kind === "var" && expr.name === name) return { ...expr, name: "__motive_value" };
  if (expr.kind === "var") return expr;
  return { ...expr, args: expr.args.map((argument) => replaceProgramVariable(argument, name)) };
}

export interface KernelCertificate {
  readonly environment: Environment;
  readonly theoremType?: Term;
  readonly theoremTerm?: Term;
  readonly script: string;
}

/** Kernel terms as pretty-printer documents: flat output is byte-identical to
 * termToString, but each compound node is a group, so at a finite width a
 * too-long term breaks Haskell-style. Applications are flattened curried
 * spines (`map f (append nil ys)`) with only compound arguments
 * parenthesized; a too-wide spine lays out with FILL semantics — as many
 * arguments per line as fit the width budget, continuation lines nested two
 * spaces under the head — so short arguments stay attached to the head even
 * when a long compound argument wraps. */
function termToDoc(term: Term): Doc {
  const broken = (...items: readonly Doc[]): Doc => group(cat(...items));
  const spine = (items: readonly Doc[]): Doc => group(nest(2, fill(items)));
  switch (term.kind) {
    case "type": return text(`Type ${term.level}`);
    case "var": return text(term.name);
    case "const": return text(term.name);
    case "pi": return broken(text(`(Π ${term.param} : `), termToDoc(term.domain), text(","), nest(2, cat(line, termToDoc(term.codomain))), text(")"));
    case "lam": return broken(text(`(λ ${term.param} : `), termToDoc(term.paramType), text(","), nest(2, cat(line, termToDoc(term.body))), text(")"));
    case "let": return broken(text(`(let ${term.name} : `), termToDoc(term.valueType), text(" :="), nest(2, cat(line, termToDoc(term.value))), text(";"), nest(2, cat(line, termToDoc(term.body))), text(")"));
    case "app": {
      const { head, args } = applicationSpine(term);
      return spine([termToAtomDoc(head), ...args.map(termToAtomDoc)]);
    }
    case "eq": return broken(text("("), termToDoc(term.left), text(" ="), nest(2, cat(line, termToDoc(term.right))), text(")"));
    case "refl": return spine([text("refl"), termToAtomDoc(term.value)]);
    case "recursor": {
      const head = term.parameters.length === 0
        ? text(`${term.inductive}.rec`)
        : cat(
            text(`${term.inductive}.rec [`),
            ...term.parameters.flatMap((parameter, index) => index === 0 ? [termToDoc(parameter)] : [text(", "), termToDoc(parameter)]),
            text("]"),
          );
      return spine([head, ...term.cases.map(termToAtomDoc), termToAtomDoc(term.target)]);
    }
    case "subst": return spine([text("subst"), termToAtomDoc(term.proof), termToAtomDoc(term.motive), termToAtomDoc(term.value)]);
  }
}

/** Parenthesizes a spine-position Doc unless the term is an atom or prints its own delimiters. */
function termToAtomDoc(term: Term): Doc {
  switch (term.kind) {
    case "var":
    case "const":
    case "pi":
    case "lam":
    case "let":
    case "eq":
      return termToDoc(term);
    case "type":
    case "app":
    case "refl":
    case "recursor":
    case "subst":
      return group(cat(text("("), termToDoc(term), text(")")));
  }
}

/** Script layout width: proof terms wrap tree-style past this column. */
const SCRIPT_COLUMNS = 72;

const prettyTerm = (term: Term): string => render(termToDoc(term), SCRIPT_COLUMNS);

/** Validate every visible transition and, when complete, the exact assembled theorem term. */
export function checkProofSession(value: unknown): KernelCertificate {
  const session = decodeProofSession(value);
  const environment = touchProofEnvironment();
  assertAxiomFree(environment);
  for (const goal of [...session.ancestors, ...session.goals]) {
    if (isPropositionGoal(goal)) validatePropositionGoal(goal, environment);
    else validateOpenGoal(goal, environment);
  }
  if (session.goals.some((goal) => goal.status !== "solved")) {
    return {
      environment,
      script: session.goals.map((goal) => prettyTerm(
        isPropositionGoal(goal) ? propositionTerm(goal.proposition) : equalityType(goal, goal.left, goal.right),
      )).join("\n"),
    };
  }
  const theorem = theoremCertificate(session, environment);
  check(theorem.term, theorem.type, new Map(), environment);
  return {
    environment,
    theoremType: theorem.type,
    theoremTerm: theorem.term,
    script: `${prettyTerm(theorem.term)}\n: ${prettyTerm(theorem.type)}`,
  };
}
