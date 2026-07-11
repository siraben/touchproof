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
  termToString,
  variable,
  type Term,
} from "../kernel/term.js";
import { allExpressions, expressionEqual, replaceById, type Expr } from "./ast.js";
import { inductiveByName } from "./inductives.js";
import { decodeProofSession } from "./protocol.js";
import { touchProofEnvironment } from "./standardLibrary.js";
import { instantiateHypothesis, type EquationGoal, type Hypothesis, type ProofSession, type ProofStep } from "./session.js";

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
    const binderType = valueType(sourceType);
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

function theoremCertificate(session: ProofSession, environment: Environment): { readonly type: Term; readonly term: Term } {
  const theoremBinders = binders(session.theoremContext);
  const resultType = valueType(session.goals[0]!.type);
  const statement = equal(resultType, expressionTerm(session.theoremLeft), expressionTerm(session.theoremRight));
  if (session.analysis === undefined) {
    return { type: wrapPis(theoremBinders, statement), term: wrapLambdas(theoremBinders, goalProof(session.goals[0]!, environment)) };
  }
  const inductive = inductiveByName(session.analysis.type);
  if (inductive === undefined || session.goals.length !== inductive.constructors.length) throw new Error("invalid induction branches");
  const analyzedType = constant(session.analysis.type);
  const generalizedBinders = theoremBinders.filter((binder) => session.generalizedVariables.includes(binder.name));
  const motiveBody = equal(
    resultType,
    expressionTerm(replaceProgramVariable(session.theoremLeft, session.analysis.variable)),
    expressionTerm(replaceProgramVariable(session.theoremRight, session.analysis.variable)),
  );
  const typedMotive = lambda("__motive_value", analyzedType, wrapPis(generalizedBinders, motiveBody));
  const branches = session.goals.map((goal, index) => {
    const constructor = inductive.constructors[index]!;
    const fields = constructor.fields.map((field) => ({ name: field.name, type: valueType(field.type) }));
    const inductionHypotheses = session.analysis?.kind === "induction"
      ? constructor.fields.filter((field) => field.recursive === true).map((field) => ({
          name: goal.hypotheses.find((hypothesis) => hypothesis.id === `ih-${field.name}`)?.name ?? `ih_${field.name}`,
          type: app(typedMotive, variable(field.name)),
        }))
      : [];
    return wrapLambdas([...fields, ...inductionHypotheses, ...generalizedBinders], goalProof(goal, environment));
  });
  const body = apps(
    recursor(session.analysis.type, typedMotive, branches, variable(session.analysis.variable)),
    ...generalizedBinders.map((binder) => variable(binder.name)),
  );
  return { type: wrapPis(theoremBinders, statement), term: wrapLambdas(theoremBinders, body) };
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

/** Validate every visible transition and, when complete, the exact assembled theorem term. */
export function checkProofSession(value: unknown): KernelCertificate {
  const session = decodeProofSession(value);
  const environment = touchProofEnvironment();
  assertAxiomFree(environment);
  for (const goal of session.goals) validateOpenGoal(goal, environment);
  if (session.goals.some((goal) => goal.status !== "solved")) {
    return { environment, script: session.goals.map((goal) => termToString(equalityType(goal, goal.left, goal.right))).join("\n") };
  }
  const theorem = theoremCertificate(session, environment);
  check(theorem.term, theorem.type, new Map(), environment);
  return {
    environment,
    theoremType: theorem.type,
    theoremTerm: theorem.term,
    script: `${termToString(theorem.term)}\n: ${termToString(theorem.type)}`,
  };
}
