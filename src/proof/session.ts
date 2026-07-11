import {
  allExpressions,
  ctor,
  expressionEqual,
  exprToText,
  parseProgramExpr,
  programVar,
  replaceById,
  replaceVariable,
  type Expr,
} from "./ast.js";
import { reduceByDefinition } from "./definitions.js";
import { inductiveByName } from "./inductives.js";

export { call, ctor, exprToText, parseProgramExpr, programVar } from "./ast.js";
export type { Expr } from "./ast.js";

export interface Hypothesis {
  readonly id: string;
  readonly name: string;
  readonly left: Expr;
  readonly right: Expr;
  readonly binders?: readonly { readonly name: string; readonly type: string }[];
}

/** One branch of an analysis: which obligation it created and which (freshened) constructor fields it introduced. */
export interface AnalysisBranch {
  readonly goalId: string;
  readonly constructorName: string;
  readonly label: string;
  readonly fields: readonly { readonly name: string; readonly type: string; readonly recursive?: boolean }[];
}

/** Recorded on a goal at the moment it is split by cases/induction. */
export interface GoalAnalysis {
  readonly kind: "cases" | "induction";
  readonly variable: string;
  readonly type: "Bool" | "Nat" | "List";
  readonly branches: readonly AnalysisBranch[];
}

export interface EquationGoal {
  readonly id: string;
  readonly label: string;
  readonly context: readonly string[];
  readonly type: string;
  readonly hypotheses: readonly Hypothesis[];
  readonly left: Expr;
  readonly right: Expr;
  readonly status: "open" | "solved";
  readonly steps: readonly ProofStep[];
  /** Variables pulled into the scope of the next induction hypothesis taken from this goal. */
  readonly generalized: readonly string[];
  /** The goal this obligation was split from; absent on the root goal. */
  readonly parentId?: string;
  /** Present exactly when this goal has been split; its steps and equation are frozen at the split point. */
  readonly analysis?: GoalAnalysis;
}

export interface ProofStep {
  readonly equation: string;
  readonly reason: string;
  readonly left: Expr;
  readonly right: Expr;
}

export interface ProofSession {
  readonly lessonId: string;
  readonly theorem: string;
  readonly statement: string;
  readonly theoremContext: readonly string[];
  readonly theoremLeft: Expr;
  readonly theoremRight: Expr;
  /** The focused goal's generalized variables (derived from the goal tree; kept for renderers). */
  readonly generalizedVariables: readonly string[];
  readonly definitionNames: readonly string[];
  readonly inductiveNames: readonly string[];
  /** Extra hypotheses granted to the branches of the FIRST analysis (the split of the root goal), keyed by branch label. */
  readonly branchLemmas?: Readonly<Record<string, readonly {
    readonly id: string;
    readonly name: string;
    readonly left: string;
    readonly right: string;
  }[]>>;
  /** Goals that have been split, in split order (a parent always precedes its descendants). */
  readonly ancestors: readonly EquationGoal[];
  /** The open/solved leaf obligations, in notebook order. */
  readonly goals: readonly EquationGoal[];
  readonly focusedGoalId: string;
  readonly kernelStatus: "pending" | "checked";
}

export interface ProofMove {
  readonly id: string;
  readonly kind: "reduce" | "cases" | "induction" | "generalize" | "rewrite" | "close";
  readonly label: string;
  readonly explanation: string;
  readonly handle: string;
  readonly dropTarget?: string;
  readonly side?: "left" | "right";
  readonly targetId?: string;
  readonly hypothesisId?: string;
  readonly variable?: string;
  readonly analysisType?: "Bool" | "Nat" | "List";
}

export interface Lesson {
  readonly id: string;
  readonly chapter: string;
  readonly title: string;
  readonly concept: string;
  readonly theorem: string;
  readonly source: string;
  readonly sourceUrl: string;
}

export const lessonCatalog: readonly Lesson[] = [
  {
    id: "bool-compute",
    chapter: "1 · Booleans",
    title: "Evaluate negation",
    concept: "Definitions compute",
    theorem: "negb false = true",
    source: "Adapted from Software Foundations, Logical Foundations: Basics",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html",
  },
  {
    id: "bool-involution",
    chapter: "2 · Booleans",
    title: "Negating twice",
    concept: "Boolean elimination",
    theorem: "negb (negb b) = b",
    source: "Adapted from Software Foundations, Logical Foundations: Basics",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html",
  },
  {
    id: "nat-add-example",
    chapter: "3 · Natural numbers",
    title: "Evaluate addition",
    concept: "Recursive computation",
    theorem: "2 + 1 = 3",
    source: "Adapted from Software Foundations, Logical Foundations: Basics",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html",
  },
  {
    id: "nat-add-zero",
    chapter: "4 · Natural numbers",
    title: "Adding zero on the right",
    concept: "Induction on Nat",
    theorem: "n + 0 = n",
    source: "Adapted from Software Foundations, Logical Foundations: Induction",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html",
  },
  {
    id: "list-append-nil",
    chapter: "5 · Lists",
    title: "Appending the empty list",
    concept: "Induction on List",
    theorem: "xs ++ [] = xs",
    source: "Adapted from Software Foundations, Logical Foundations: Lists",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html",
  },
  {
    id: "list-map-append",
    chapter: "6 · Lists",
    title: "Map distributes over append",
    concept: "Induction with parameters",
    theorem: "map f (xs ++ ys) = map f xs ++ map f ys",
    source: "Adapted from Software Foundations, Logical Foundations: Poly",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html",
  },
  {
    id: "list-rev-append",
    chapter: "7 · Lists",
    title: "Reverse an append",
    concept: "Reuse associativity",
    theorem: "rev (xs ++ ys) = rev ys ++ rev xs",
    source: "Adapted from Software Foundations, Logical Foundations: Lists",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html",
  },
  {
    id: "list-rev-involution",
    chapter: "8 · Lists",
    title: "Reversing twice",
    concept: "Reuse a proved theorem",
    theorem: "rev (rev xs) = xs",
    source: "Adapted from Software Foundations, Logical Foundations: Lists",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html",
  },
  {
    id: "list-rev-acc",
    chapter: "9 · Generalization",
    title: "Reverse with an accumulator",
    concept: "Generalizing the induction hypothesis",
    theorem: "revAcc xs acc = rev xs ++ acc",
    source: "Adapted from the generalization pattern in Software Foundations, Logical Foundations: Induction",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html",
  },
  {
    id: "map-composition",
    chapter: "10 · Higher-order functions",
    title: "Map preserves composition",
    concept: "Induction and local rewriting",
    theorem: "map (f ∘ g) l = map f (map g l)",
    source: "Inspired by Software Foundations, Logical Foundations: Poly",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html",
  },
  {
    id: "nat-add-succ-right",
    chapter: "11 · Natural numbers",
    title: "Pushing a successor rightward",
    concept: "Induction on the left argument",
    theorem: "n + S m = S (n + m)",
    source: "Adapted from Software Foundations, Logical Foundations: Induction",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html",
  },
  {
    id: "nat-add-assoc",
    chapter: "12 · Natural numbers",
    title: "Addition is associative",
    concept: "Nested data, one induction",
    theorem: "(a + b) + c = a + (b + c)",
    source: "Adapted from Software Foundations, Logical Foundations: Induction",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html",
  },
  {
    id: "nat-add-comm",
    chapter: "13 · Natural numbers",
    title: "Addition is commutative",
    concept: "Composing proved lemmas",
    theorem: "a + b = b + a",
    source: "Adapted from Software Foundations, Logical Foundations: Induction",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html",
  },
  {
    id: "list-length-append",
    chapter: "14 · Lists",
    title: "Length of an append",
    concept: "A list measure meets addition",
    theorem: "length (xs ++ ys) = length xs + length ys",
    source: "Adapted from Software Foundations, Logical Foundations: Lists",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html",
  },
  {
    id: "list-length-rev",
    chapter: "15 · Lists",
    title: "Reverse preserves length",
    concept: "Reusing a measure lemma",
    theorem: "length (rev xs) = length xs",
    source: "Adapted from Software Foundations, Logical Foundations: Lists",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html",
  },
  {
    id: "list-map-length",
    chapter: "16 · Higher-order functions",
    title: "Map preserves length",
    concept: "Higher-order functions preserve measure",
    theorem: "length (map f xs) = length xs",
    source: "Adapted from Software Foundations, Logical Foundations: Poly",
    sourceUrl: "https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html",
  },
] as const;

export function equationToText(goal: Pick<EquationGoal, "left" | "right">): string {
  return `${exprToText(goal.left)} = ${exprToText(goal.right)}`;
}


function focusedGoal(session: ProofSession): EquationGoal {
  const goal = session.goals.find((candidate) => candidate.id === session.focusedGoalId);
  if (goal === undefined) throw new Error("focused proof obligation does not exist");
  return goal;
}

interface ContextVariable {
  readonly name: string;
  readonly type: string;
  readonly inductive?: "Bool" | "Nat" | "List";
}

function contextVariables(context: readonly string[]): ContextVariable[] {
  return context.flatMap((entry) => {
    const separator = entry.indexOf(":");
    if (separator < 1) return [];
    const sourceType = entry.slice(separator + 1).trim();
    if (sourceType === "Type") return [];
    const inductive = sourceType === "Bool" ? "Bool" as const
      : sourceType === "Nat" ? "Nat" as const
        : sourceType.startsWith("List") ? "List" as const
          : undefined;
    return entry.slice(0, separator).split(",").map((name): ContextVariable => ({
      name: name.trim(),
      type: sourceType,
      ...(inductive === undefined ? {} : { inductive }),
    }));
  });
}

function matchGeneralized(
  pattern: Expr,
  value: Expr,
  names: ReadonlySet<string>,
  bindings: Map<string, Expr>,
): boolean {
  if (pattern.kind === "var" && names.has(pattern.name)) {
    const previous = bindings.get(pattern.name);
    if (previous === undefined) bindings.set(pattern.name, value);
    return previous === undefined || expressionEqual(previous, value);
  }
  if (pattern.kind !== value.kind || pattern.name !== value.name) return false;
  if (pattern.kind === "var" || value.kind === "var") return true;
  return pattern.args.length === value.args.length
    && pattern.args.every((child, index) => matchGeneralized(child, value.args[index]!, names, bindings));
}

export function instantiateHypothesis(hypothesis: Hypothesis, target: Expr): Expr | undefined {
  const names = new Set(hypothesis.binders?.map((binder) => binder.name) ?? []);
  if (names.size === 0) return expressionEqual(hypothesis.left, target) ? hypothesis.right : undefined;
  const bindings = new Map<string, Expr>();
  if (!matchGeneralized(hypothesis.left, target, names, bindings)) return undefined;
  let result = hypothesis.right;
  for (const [name, value] of bindings) result = replaceVariable(result, name, value);
  return result;
}

interface LessonSpec {
  readonly theorem: string;
  readonly context: readonly string[];
  readonly resultType: string;
  readonly left: string;
  readonly right: string;
  readonly definitions: readonly string[];
  readonly inductives: readonly string[];
  readonly branchLemmas?: ProofSession["branchLemmas"];
}

const lessonSpecs: Readonly<Record<string, LessonSpec>> = {
  "bool-compute": { theorem: "negb_false", context: [], resultType: "Bool", left: "negb(false)", right: "true", definitions: ["negb"], inductives: ["Bool"] },
  "bool-involution": { theorem: "negb_involutive", context: ["b : Bool"], resultType: "Bool", left: "negb(negb(b))", right: "b", definitions: ["negb"], inductives: ["Bool"] },
  "nat-add-example": { theorem: "two_plus_one", context: [], resultType: "Nat", left: "add(succ(succ(zero)), succ(zero))", right: "succ(succ(succ(zero)))", definitions: ["add"], inductives: ["Nat"] },
  "nat-add-zero": { theorem: "add_zero_right", context: ["n : Nat"], resultType: "Nat", left: "add(n, zero)", right: "n", definitions: ["add"], inductives: ["Nat"] },
  "list-append-nil": { theorem: "append_nil_right", context: ["A : Type", "xs : List A"], resultType: "List A", left: "append(xs, nil)", right: "xs", definitions: ["append"], inductives: ["List"] },
  "list-map-append": { theorem: "map_append", context: ["A, B : Type", "f : A → B", "xs : List A", "ys : List A"], resultType: "List B", left: "map(f, append(xs, ys))", right: "append(map(f, xs), map(f, ys))", definitions: ["append", "map"], inductives: ["List"] },
  "list-rev-append": {
    theorem: "rev_append", context: ["A : Type", "xs : List A", "ys : List A"], resultType: "List A", left: "rev(append(xs, ys))", right: "append(rev(ys), rev(xs))", definitions: ["append", "rev"], inductives: ["List"],
    branchLemmas: {
      "empty list": [{ id: "lemma-append-nil", name: "append_nil", left: "append(rev(ys), nil)", right: "rev(ys)" }],
      "x :: xs": [{ id: "lemma-append-assoc", name: "append_assoc", left: "append(append(rev(ys), rev(xs)), cons(x, nil))", right: "append(rev(ys), append(rev(xs), cons(x, nil)))" }],
    },
  },
  "list-rev-involution": {
    theorem: "rev_involutive", context: ["A : Type", "xs : List A"], resultType: "List A", left: "rev(rev(xs))", right: "xs", definitions: ["append", "rev"], inductives: ["List"],
    branchLemmas: { "x :: xs": [{ id: "lemma-rev-append", name: "rev_append", left: "rev(append(rev(xs), cons(x, nil)))", right: "append(rev(cons(x, nil)), rev(rev(xs)))" }] },
  },
  "map-composition": { theorem: "map_comp", context: ["A, B, C : Type", "f : B → C", "g : A → B", "l : List A"], resultType: "List C", left: "map(compose(f, g), l)", right: "map(f, map(g, l))", definitions: ["map", "apply"], inductives: ["List"] },
  "list-rev-acc": {
    theorem: "rev_acc_correct", context: ["A : Type", "xs : List A", "acc : List A"], resultType: "List A",
    left: "revAcc(xs, acc)", right: "append(rev(xs), acc)", definitions: ["revAcc", "rev", "append"], inductives: ["List"],
    branchLemmas: {
      "x :: xs": [{
        id: "lemma-append-assoc", name: "append_assoc",
        left: "append(append(rev(xs), cons(x, nil)), acc)",
        right: "append(rev(xs), append(cons(x, nil), acc))",
      }],
    },
  },
  "nat-add-succ-right": {
    theorem: "add_succ_right", context: ["n : Nat", "m : Nat"], resultType: "Nat",
    left: "add(n, succ(m))", right: "succ(add(n, m))", definitions: ["add"], inductives: ["Nat"],
  },
  "nat-add-assoc": {
    theorem: "add_assoc", context: ["a : Nat", "b : Nat", "c : Nat"], resultType: "Nat",
    left: "add(add(a, b), c)", right: "add(a, add(b, c))", definitions: ["add"], inductives: ["Nat"],
  },
  "nat-add-comm": {
    theorem: "add_comm", context: ["a : Nat", "b : Nat"], resultType: "Nat",
    left: "add(a, b)", right: "add(b, a)", definitions: ["add"], inductives: ["Nat"],
    branchLemmas: {
      "0": [{ id: "lemma-add-zero-right", name: "add_zero_right", left: "add(b, zero)", right: "b" }],
      "S n": [{ id: "lemma-add-succ-right", name: "add_succ_right", left: "add(b, succ(n))", right: "succ(add(b, n))" }],
    },
  },
  "list-length-append": {
    theorem: "length_append", context: ["A : Type", "xs : List A", "ys : List A"], resultType: "Nat",
    left: "length(append(xs, ys))", right: "add(length(xs), length(ys))", definitions: ["length", "append", "add"], inductives: ["List"],
  },
  "list-length-rev": {
    theorem: "length_rev", context: ["A : Type", "xs : List A"], resultType: "Nat",
    left: "length(rev(xs))", right: "length(xs)", definitions: ["length", "rev", "append", "add"], inductives: ["List"],
    branchLemmas: {
      "x :: xs": [
        { id: "lemma-length-append", name: "length_append", left: "length(append(rev(xs), cons(x, nil)))", right: "add(length(rev(xs)), length(cons(x, nil)))" },
        { id: "lemma-add-one-right", name: "add_one_right", left: "add(length(xs), succ(zero))", right: "succ(length(xs))" },
      ],
    },
  },
  "list-map-length": {
    theorem: "map_length", context: ["A, B : Type", "f : A → B", "xs : List A"], resultType: "Nat",
    left: "length(map(f, xs))", right: "length(xs)", definitions: ["length", "map"], inductives: ["List"],
  },
};

export function createLessonSession(lessonId: string): ProofSession {
  const spec = lessonSpecs[lessonId];
  const lesson = lessonCatalog.find((candidate) => candidate.id === lessonId);
  if (spec === undefined || lesson === undefined) throw new Error(`unknown lesson ${lessonId}`);
  const left = parseProgramExpr(spec.left);
  const right = parseProgramExpr(spec.right);
  const goal: EquationGoal = {
    id: "goal-root", label: lesson.title, context: spec.context, type: spec.resultType, hypotheses: [], left, right, status: "open",
    steps: [{ equation: `${exprToText(left)} = ${exprToText(right)}`, reason: "theorem statement", left, right }],
    generalized: [],
  };
  return {
    lessonId, theorem: spec.theorem, statement: lesson.theorem,
    theoremContext: spec.context, theoremLeft: left, theoremRight: right,
    definitionNames: spec.definitions, inductiveNames: spec.inductives,
    generalizedVariables: [],
    ...(spec.branchLemmas === undefined ? {} : { branchLemmas: spec.branchLemmas }),
    ancestors: [], goals: [goal], focusedGoalId: goal.id, kernelStatus: "pending",
  };
}

/**
 * Re-derives the state that hangs off the goal tree: ancestor statuses
 * (a split goal is solved exactly when all of its branches are) and the
 * focused goal's generalized-variable mirror. Every session returned to a
 * caller passes through here.
 */
export function withDerivedSessionState(session: ProofSession): ProofSession {
  const statuses = new Map<string, "open" | "solved">(session.goals.map((goal) => [goal.id, goal.status]));
  let ancestorsChanged = false;
  const ancestors = [...session.ancestors];
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]!;
    const solved = ancestor.analysis?.branches.every((branch) => statuses.get(branch.goalId) === "solved") === true;
    const status = solved ? "solved" as const : "open" as const;
    statuses.set(ancestor.id, status);
    if (status !== ancestor.status) {
      ancestors[index] = { ...ancestor, status };
      ancestorsChanged = true;
    }
  }
  const generalizedVariables = session.goals.find((goal) => goal.id === session.focusedGoalId)?.generalized ?? [];
  const sameGeneralized = generalizedVariables.length === session.generalizedVariables.length
    && generalizedVariables.every((name, index) => session.generalizedVariables[index] === name);
  if (!ancestorsChanged && sameGeneralized) return session;
  return { ...session, ...(ancestorsChanged ? { ancestors } : {}), generalizedVariables };
}

export function createMapCompositionSession(): ProofSession {
  return createLessonSession("map-composition");
}

export function enumerateProofMoves(session: ProofSession): ProofMove[] {
  const goal = focusedGoal(session);
  if (goal.status === "solved") return [];
  const moves: ProofMove[] = [];
  // Structural moves derive purely from the goal's own state: any context
  // variable of inductive type occurring in the goal may be analyzed, in any
  // goal, repeatedly — including variables introduced by earlier analyses.
  for (const candidate of contextVariables(goal.context)) {
    const occurrence = [...allExpressions(goal.left), ...allExpressions(goal.right)].find(
      (expr) => expr.kind === "var" && expr.name === candidate.name,
    );
    if (occurrence === undefined) continue;
    if (goal.generalized.includes(candidate.name)) continue;
    if (candidate.inductive !== undefined) {
      const inductive = inductiveByName(candidate.inductive);
      // Induction on a variable that a hypothesis mentions is not offered
      // (Coq errors with "x is used in hypothesis"; auto-reverting is out of
      // scope). Case analysis remains available: it instantiates hypotheses.
      const mentionedInHypotheses = goal.hypotheses.some((hypothesis) => hypothesisMentions(hypothesis, candidate.name));
      if (!mentionedInHypotheses
        && inductive?.constructors.some((constructor) => constructor.fields.some((field) => field.recursive === true)) === true) {
        moves.push({
          id: `induction:${candidate.name}`,
          kind: "induction",
          label: `Induct on ${candidate.name}`,
          explanation: `Consider every constructor of ${candidate.inductive} and add hypotheses for recursive fields.`,
          handle: occurrence.id,
          dropTarget: "analysis-zone",
          variable: candidate.name,
          analysisType: candidate.inductive,
        });
      }
      moves.push({
        id: `cases:${candidate.name}`,
        kind: "cases",
        label: `Case analysis on ${candidate.name}`,
        explanation: `Consider every constructor of ${candidate.inductive}.`,
        handle: occurrence.id,
        dropTarget: "analysis-zone",
        variable: candidate.name,
        analysisType: candidate.inductive,
      });
    }
    moves.push({
      id: `generalize:${candidate.name}`,
      kind: "generalize",
      label: `Generalize ${candidate.name}`,
      explanation: `Move ${candidate.name} inside the next induction hypothesis so it can vary in recursive cases.`,
      handle: occurrence.id,
      variable: candidate.name,
    });
  }
  for (const side of ["left", "right"] as const) {
    for (const expression of allExpressions(goal[side])) {
      const reduction = reduceByDefinition(expression);
      if (reduction !== undefined) {
        moves.push({
          id: `reduce:${side}:${expression.id}`,
          kind: "reduce",
          label: `${reduction.definition.name} case: ${reduction.clause.label}`,
          explanation: `Apply the defining equation “${reduction.clause.script}”.`,
          handle: expression.id,
          side,
          targetId: expression.id,
        });
      }
    }
  }
  for (const hypothesis of goal.hypotheses) {
    for (const side of ["left", "right"] as const) {
      for (const expression of allExpressions(goal[side])) {
        if (instantiateHypothesis(hypothesis, expression) !== undefined) {
          moves.push({
            id: `rewrite:${hypothesis.id}:${side}:${expression.id}`,
            kind: "rewrite",
            label: `Rewrite with ${hypothesis.name}`,
            explanation: "Replace this occurrence using the local induction hypothesis.",
            handle: hypothesis.id,
            dropTarget: expression.id,
            side,
            targetId: expression.id,
            hypothesisId: hypothesis.id,
          });
        }
      }
    }
  }
  if (expressionEqual(goal.left, goal.right)) {
    moves.push({
      id: `close:${goal.id}`,
      kind: "close",
      label: "Close by reflexivity",
      explanation: "Both sides are definitionally the same expression.",
      handle: goal.id,
    });
  }
  return moves;
}

function updateGoal(session: ProofSession, nextGoal: EquationGoal): ProofSession {
  return { ...session, goals: session.goals.map((goal) => goal.id === nextGoal.id ? nextGoal : goal) };
}

function contextEntryNames(entry: string): string[] {
  const separator = entry.indexOf(":");
  return separator < 1 ? [] : entry.slice(0, separator).split(",").map((name) => name.trim());
}

function expressionVariables(expr: Expr): string[] {
  return allExpressions(expr).filter((node) => node.kind === "var").map((node) => node.name);
}

/** Whether `name` occurs FREE in the hypothesis (occurrences bound by the hypothesis' own binders do not count). */
export function hypothesisMentions(hypothesis: Hypothesis, name: string): boolean {
  if (hypothesis.binders?.some((binder) => binder.name === name) === true) return false;
  return expressionVariables(hypothesis.left).includes(name) || expressionVariables(hypothesis.right).includes(name);
}

/**
 * Splits `goal` (a leaf of the tree) into one obligation per constructor of
 * the analyzed variable's type, in place: the children take the goal's slot
 * in the notebook, the goal itself is frozen into `session.ancestors`, and
 * its steps/equation become the split point the certificate composes over.
 *
 * Introduced constructor fields are freshened against everything in scope
 * (context, hypotheses, the goal itself). Hypotheses are inherited — and,
 * exactly like Coq's `destruct`, every hypothesis that freely mentions the
 * analyzed variable is INSTANTIATED per branch with the constructor pattern
 * (the certificate reverts those hypotheses through the recursor motive).
 * Induction never sees such hypotheses: its move is not offered then.
 */
function splitGoal(session: ProofSession, goal: EquationGoal, kind: "cases" | "induction", name: string, analyzedType: "Bool" | "Nat" | "List"): ProofSession {
  const inductive = inductiveByName(analyzedType);
  if (inductive === undefined) throw new Error(`unknown inductive type ${analyzedType}`);
  const hypothesisVariables = new Set(goal.hypotheses.flatMap((hypothesis) => [
    ...expressionVariables(hypothesis.left),
    ...expressionVariables(hypothesis.right),
    ...(hypothesis.binders ?? []).map((binder) => binder.name),
  ]));
  const instantiateHypotheses = goal.hypotheses.some((hypothesis) => hypothesisMentions(hypothesis, name));
  const baseContext = goal.context.filter((entry) => !entry.startsWith(`${name} :`));
  const usedNames = new Set([
    ...baseContext.flatMap(contextEntryNames),
    ...hypothesisVariables,
    ...expressionVariables(goal.left),
    ...expressionVariables(goal.right),
  ]);
  // When no hypothesis is instantiated the analyzed name is simply consumed
  // and its spelling may be reused for a field (`cases xs` reintroduces xs).
  // When hypotheses ARE rewritten, fields freshen away from it so the
  // instantiation is visible (IH : n + 0 = n becomes IH : S n2 + 0 = S n2).
  if (!instantiateHypotheses) usedNames.delete(name);
  let ihName = "IH";
  for (let suffix = 2; goal.hypotheses.some((hypothesis) => hypothesis.name === ihName); suffix += 1) ihName = `IH${suffix}`;
  const generalizedBinders = goal.generalized.map((variable) => {
    const found = contextVariables(goal.context).find((candidate) => candidate.name === variable);
    if (found === undefined) throw new Error(`cannot generalize unknown variable ${variable}`);
    return { name: variable, type: found.type };
  });
  const children = inductive.constructors.map((constructor, index) => {
    const taken = new Set(usedNames);
    const renamedFields = constructor.fields.map((field) => {
      let fresh = field.name;
      for (let suffix = 2; taken.has(fresh); suffix += 1) fresh = `${field.name}${suffix}`;
      taken.add(fresh);
      return { ...field, name: fresh };
    });
    const branchLabel = constructor.label.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => {
      const fieldIndex = constructor.fields.findIndex((field) => field.name === token);
      return fieldIndex < 0 ? token : renamedFields[fieldIndex]!.name;
    });
    const value = ctor(constructor.name, renamedFields.map((field) => programVar(field.name)));
    const left = replaceVariable(goal.left, name, value);
    const right = replaceVariable(goal.right, name, value);
    // destruct semantics: hypotheses freely mentioning the analyzed variable
    // receive this branch's constructor pattern (id and name are preserved;
    // the certificate reverts them through the motive).
    const inheritedHypotheses = goal.hypotheses.map((hypothesis) => hypothesisMentions(hypothesis, name)
      ? { ...hypothesis, left: replaceVariable(hypothesis.left, name, value), right: replaceVariable(hypothesis.right, name, value) }
      : hypothesis);
    const recursiveField = renamedFields.find((field) => field.recursive === true);
    const inductionHypotheses: Hypothesis[] = kind === "induction" && recursiveField !== undefined
      ? [{
          id: `ih-${recursiveField.name}`,
          name: ihName,
          left: replaceVariable(goal.left, name, programVar(recursiveField.name)),
          right: replaceVariable(goal.right, name, programVar(recursiveField.name)),
          ...(generalizedBinders.length === 0 ? {} : { binders: generalizedBinders }),
        }]
      : [];
    const configured = goal.id === "goal-root" ? session.branchLemmas?.[branchLabel] ?? [] : [];
    const lemmas = configured.map((lemma): Hypothesis => ({
      id: lemma.id,
      name: lemma.name,
      left: parseProgramExpr(lemma.left),
      right: parseProgramExpr(lemma.right),
    }));
    const id = goal.id === "goal-root" ? `goal-${index}` : `${goal.id}.${index}`;
    const label = goal.id === "goal-root" ? branchLabel : `${goal.label} · ${branchLabel}`;
    const child: EquationGoal = {
      id,
      label,
      context: [...baseContext, ...renamedFields.map((field) => `${field.name} : ${field.type}`)],
      type: goal.type,
      hypotheses: [...inheritedHypotheses, ...inductionHypotheses, ...lemmas],
      left,
      right,
      status: "open",
      steps: [{ equation: `${exprToText(left)} = ${exprToText(right)}`, reason: `${branchLabel} obligation`, left, right }],
      generalized: [],
      parentId: goal.id,
    };
    const branch: AnalysisBranch = { goalId: id, constructorName: constructor.name, label: branchLabel, fields: renamedFields };
    return { child, branch };
  });
  const analysis: GoalAnalysis = { kind, variable: name, type: analyzedType, branches: children.map((entry) => entry.branch) };
  const position = session.goals.findIndex((candidate) => candidate.id === goal.id);
  if (position < 0) throw new Error("only leaf obligations can be analyzed");
  return {
    ...session,
    ancestors: [...session.ancestors, { ...goal, analysis }],
    goals: [
      ...session.goals.slice(0, position),
      ...children.map((entry) => entry.child),
      ...session.goals.slice(position + 1),
    ],
    focusedGoalId: children[0]!.child.id,
  };
}

export function applyProofMove(session: ProofSession, moveId: string): ProofSession {
  const move = enumerateProofMoves(session).find((candidate) => candidate.id === moveId);
  if (move === undefined) throw new Error(`illegal proof move: ${moveId}`);
  const goal = focusedGoal(session);

  if (move.kind === "generalize" && move.variable !== undefined) {
    return withDerivedSessionState(updateGoal(session, { ...goal, generalized: [...goal.generalized, move.variable] }));
  }

  if ((move.kind === "induction" || move.kind === "cases") && move.variable !== undefined && move.analysisType !== undefined) {
    return withDerivedSessionState(splitGoal(session, goal, move.kind, move.variable, move.analysisType));
  }

  if (move.kind === "reduce" && move.side !== undefined && move.targetId !== undefined) {
    const target = allExpressions(goal[move.side]).find((expr) => expr.id === move.targetId);
    const reduction = target === undefined ? undefined : reduceByDefinition(target);
    if (reduction === undefined) throw new Error("reduction target is no longer reducible");
    const nextGoal = {
      ...goal,
      [move.side]: replaceById(goal[move.side], move.targetId, reduction.expression),
    };
    const withStep = {
      ...nextGoal,
      steps: [...goal.steps, { equation: equationToText(nextGoal), reason: move.label, left: nextGoal.left, right: nextGoal.right }],
    };
    return updateGoal(session, withStep);
  }

  if (move.kind === "rewrite" && move.side !== undefined && move.targetId !== undefined && move.hypothesisId !== undefined) {
    const hypothesis = goal.hypotheses.find((candidate) => candidate.id === move.hypothesisId);
    if (hypothesis === undefined) throw new Error("rewrite hypothesis is unavailable");
    const target = allExpressions(goal[move.side]).find((expr) => expr.id === move.targetId);
    const replacement = target === undefined ? undefined : instantiateHypothesis(hypothesis, target);
    if (replacement === undefined) throw new Error("rewrite hypothesis does not match the target");
    const nextGoal = {
      ...goal,
      [move.side]: replaceById(goal[move.side], move.targetId, replacement),
    };
    const withStep = {
      ...nextGoal,
      steps: [...goal.steps, { equation: equationToText(nextGoal), reason: `rewrite with ${hypothesis.name}`, left: nextGoal.left, right: nextGoal.right }],
    };
    return updateGoal(session, withStep);
  }

  if (move.kind === "close") {
    const solved = { ...goal, status: "solved" as const, steps: [...goal.steps, { equation: equationToText(goal), reason: "reflexivity", left: goal.left, right: goal.right }] };
    const updated = updateGoal(session, solved);
    const nextOpen = updated.goals.find((candidate) => candidate.status === "open");
    return withDerivedSessionState(nextOpen === undefined ? updated : { ...updated, focusedGoalId: nextOpen.id });
  }

  throw new Error(`unsupported proof move ${move.kind}`);
}

/** Only a successful check of the assembled dependent proof term may grant this status. */
export function markKernelChecked(session: ProofSession): ProofSession {
  if (session.goals.some((goal) => goal.status !== "solved")) {
    throw new Error("the kernel cannot certify an incomplete proof");
  }
  return { ...session, kernelStatus: "checked" };
}

export function focusGoal(session: ProofSession, goalId: string): ProofSession {
  if (!session.goals.some((goal) => goal.id === goalId)) throw new Error(`unknown obligation ${goalId}`);
  return withDerivedSessionState({ ...session, focusedGoalId: goalId });
}
