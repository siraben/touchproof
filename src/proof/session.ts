import { verifyLessonProof } from "./standardLibrary.js";
import {
  allExpressions,
  call,
  cloneFresh,
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
}

export interface EquationGoal {
  readonly id: string;
  readonly label: string;
  readonly context: readonly string[];
  readonly hypotheses: readonly Hypothesis[];
  readonly left: Expr;
  readonly right: Expr;
  readonly status: "open" | "solved";
  readonly steps: readonly ProofStep[];
}

export interface ProofStep {
  readonly equation: string;
  readonly reason: string;
}

export interface ProofSession {
  readonly lessonId: string;
  readonly theorem: string;
  readonly statement: string;
  readonly analysis?: {
    readonly kind: "cases" | "induction";
    readonly variable: string;
    readonly type: "Bool" | "Nat" | "List";
  };
  readonly definitionNames: readonly string[];
  readonly inductiveNames: readonly string[];
  readonly branchLemmas?: Readonly<Record<string, readonly {
    readonly id: string;
    readonly name: string;
    readonly left: string;
    readonly right: string;
  }[]>>;
  readonly goals: readonly EquationGoal[];
  readonly focusedGoalId: string;
  readonly kernelStatus: "pending" | "checked";
}

export interface ProofMove {
  readonly id: string;
  readonly kind: "reduce" | "cases" | "induction" | "rewrite" | "close";
  readonly label: string;
  readonly explanation: string;
  readonly handle: string;
  readonly dropTarget?: string;
  readonly side?: "left" | "right";
  readonly targetId?: string;
  readonly hypothesisId?: string;
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
    id: "map-composition",
    chapter: "9 · Higher-order functions",
    title: "Map preserves composition",
    concept: "Induction and local rewriting",
    theorem: "map (f ∘ g) l = map f (map g l)",
    source: "Inspired by Software Foundations, Logical Foundations: Poly",
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

interface LessonSpec {
  readonly theorem: string;
  readonly context: readonly string[];
  readonly left: string;
  readonly right: string;
  readonly definitions: readonly string[];
  readonly inductives: readonly string[];
  readonly analysis?: NonNullable<ProofSession["analysis"]>;
  readonly branchLemmas?: ProofSession["branchLemmas"];
}

const lessonSpecs: Readonly<Record<string, LessonSpec>> = {
  "bool-compute": { theorem: "negb_false", context: [], left: "negb(false)", right: "true", definitions: ["negb"], inductives: ["Bool"] },
  "bool-involution": { theorem: "negb_involutive", context: ["b : Bool"], left: "negb(negb(b))", right: "b", definitions: ["negb"], inductives: ["Bool"], analysis: { kind: "cases", variable: "b", type: "Bool" } },
  "nat-add-example": { theorem: "two_plus_one", context: [], left: "add(succ(succ(zero)), succ(zero))", right: "succ(succ(succ(zero)))", definitions: ["add"], inductives: ["Nat"] },
  "nat-add-zero": { theorem: "add_zero_right", context: ["n : Nat"], left: "add(n, zero)", right: "n", definitions: ["add"], inductives: ["Nat"], analysis: { kind: "induction", variable: "n", type: "Nat" } },
  "list-append-nil": { theorem: "append_nil_right", context: ["A : Type", "xs : List A"], left: "append(xs, nil)", right: "xs", definitions: ["append"], inductives: ["List"], analysis: { kind: "induction", variable: "xs", type: "List" } },
  "list-map-append": { theorem: "map_append", context: ["A, B : Type", "f : A → B", "xs : List A", "ys : List A"], left: "map(f, append(xs, ys))", right: "append(map(f, xs), map(f, ys))", definitions: ["append", "map"], inductives: ["List"], analysis: { kind: "induction", variable: "xs", type: "List" } },
  "list-rev-append": {
    theorem: "rev_append", context: ["A : Type", "xs : List A", "ys : List A"], left: "rev(append(xs, ys))", right: "append(rev(ys), rev(xs))", definitions: ["append", "rev"], inductives: ["List"], analysis: { kind: "induction", variable: "xs", type: "List" },
    branchLemmas: {
      "empty list": [{ id: "lemma-append-nil", name: "append_nil", left: "append(rev(ys), nil)", right: "rev(ys)" }],
      "x :: xs": [{ id: "lemma-append-assoc", name: "append_assoc", left: "append(append(rev(ys), rev(xs)), cons(x, nil))", right: "append(rev(ys), append(rev(xs), cons(x, nil)))" }],
    },
  },
  "list-rev-involution": {
    theorem: "rev_involutive", context: ["A : Type", "xs : List A"], left: "rev(rev(xs))", right: "xs", definitions: ["append", "rev"], inductives: ["List"], analysis: { kind: "induction", variable: "xs", type: "List" },
    branchLemmas: { "x :: xs": [{ id: "lemma-rev-append", name: "rev_append", left: "rev(append(rev(xs), cons(x, nil)))", right: "append(rev(cons(x, nil)), rev(rev(xs)))" }] },
  },
  "map-composition": { theorem: "map_comp", context: ["A : Type", "f : A → A", "g : A → A", "l : List A"], left: "map(compose(f, g), l)", right: "map(f, map(g, l))", definitions: ["map", "apply"], inductives: ["List"], analysis: { kind: "induction", variable: "l", type: "List" } },
};

export function createLessonSession(lessonId: string): ProofSession {
  const spec = lessonSpecs[lessonId];
  const lesson = lessonCatalog.find((candidate) => candidate.id === lessonId);
  if (spec === undefined || lesson === undefined) throw new Error(`unknown lesson ${lessonId}`);
  const left = parseProgramExpr(spec.left);
  const right = parseProgramExpr(spec.right);
  const goal: EquationGoal = {
    id: "goal-root", label: lesson.title, context: spec.context, hypotheses: [], left, right, status: "open",
    steps: [{ equation: `${exprToText(left)} = ${exprToText(right)}`, reason: "theorem statement" }],
  };
  return {
    lessonId, theorem: spec.theorem, statement: lesson.theorem, definitionNames: spec.definitions, inductiveNames: spec.inductives,
    ...(spec.analysis === undefined ? {} : { analysis: spec.analysis }),
    ...(spec.branchLemmas === undefined ? {} : { branchLemmas: spec.branchLemmas }),
    goals: [goal], focusedGoalId: goal.id, kernelStatus: "pending",
  };
}

export function createMapCompositionSession(): ProofSession {
  return createLessonSession("map-composition");
}

export function enumerateProofMoves(session: ProofSession): ProofMove[] {
  const goal = focusedGoal(session);
  if (goal.status === "solved") return [];
  const moves: ProofMove[] = [];
  if (goal.id === "goal-root" && session.analysis !== undefined) {
    const analyzedVariable = allExpressions(goal.left).find(
      (expr) => expr.kind === "var" && expr.name === session.analysis?.variable,
    );
    if (analyzedVariable !== undefined) {
      moves.push({
        id: `${session.analysis.kind}:${session.analysis.variable}`,
        kind: session.analysis.kind,
        label: session.analysis.kind === "cases"
          ? `Case analysis on ${session.analysis.variable}`
          : `Induct on ${session.analysis.variable}`,
        explanation: session.analysis.kind === "cases"
          ? `Consider every constructor of ${session.analysis.type}.`
          : `Consider every constructor of ${session.analysis.type} and reuse the claim for recursive fields.`,
        handle: analyzedVariable.id,
        dropTarget: "analysis-zone",
      });
    }
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
        if (expressionEqual(expression, hypothesis.left)) {
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

export function applyProofMove(session: ProofSession, moveId: string): ProofSession {
  const move = enumerateProofMoves(session).find((candidate) => candidate.id === moveId);
  if (move === undefined) throw new Error(`illegal proof move: ${moveId}`);
  const goal = focusedGoal(session);

  if ((move.kind === "induction" || move.kind === "cases") && session.analysis !== undefined) {
    const { variable: name, type: analyzedType } = session.analysis;
    const baseContext = goal.context.filter((entry) => !entry.startsWith(`${name} :`));
    const inductive = inductiveByName(analyzedType);
    if (inductive === undefined) throw new Error(`unknown inductive type ${analyzedType}`);
    const constructors = inductive.constructors.map((constructor) => {
      const fields = constructor.fields.map((field) => programVar(field.name));
      const recursiveIndex = constructor.fields.findIndex((field) => field.recursive === true);
      return {
        label: constructor.label,
        value: ctor(constructor.name, fields),
        context: [...baseContext, ...constructor.fields.map((field) => `${field.name} : ${field.type}`)],
        ...(recursiveIndex < 0 ? {} : { recursive: fields[recursiveIndex]! }),
      };
    });
    let obligations = constructors.map((branch, index): EquationGoal => {
      const left = replaceVariable(goal.left, name, branch.value);
      const right = replaceVariable(goal.right, name, branch.value);
      const hypotheses = branch.recursive === undefined || move.kind === "cases"
        ? []
        : [{
            id: `ih-${branch.recursive.name}`,
            name: "IH",
            left: replaceVariable(goal.left, name, branch.recursive),
            right: replaceVariable(goal.right, name, branch.recursive),
          }];
      return {
        id: `goal-${index}`,
        label: branch.label,
        context: branch.context,
        hypotheses,
        left,
        right,
        status: "open",
        steps: [{ equation: `${exprToText(left)} = ${exprToText(right)}`, reason: `${branch.label} obligation` }],
      };
    });
    obligations = obligations.map((obligation) => {
      const configured = session.branchLemmas?.[obligation.label] ?? [];
      return configured.length === 0 ? obligation : {
        ...obligation,
        hypotheses: [...obligation.hypotheses, ...configured.map((lemma): Hypothesis => ({
          id: lemma.id,
          name: lemma.name,
          left: parseProgramExpr(lemma.left),
          right: parseProgramExpr(lemma.right),
        }))],
      };
    });
    return { ...session, goals: obligations, focusedGoalId: obligations[0]!.id };
  }

  if (move.kind === "reduce" && move.side !== undefined && move.targetId !== undefined) {
    const target = allExpressions(goal[move.side]).find((expr) => expr.id === move.targetId);
    const reduction = target === undefined ? undefined : reduceByDefinition(target);
    if (reduction === undefined) throw new Error("reduction target is no longer reducible");
    const nextGoal = {
      ...goal,
      [move.side]: replaceById(goal[move.side], move.targetId, reduction.expression),
    } as EquationGoal;
    const withStep = {
      ...nextGoal,
      steps: [...goal.steps, { equation: equationToText(nextGoal), reason: move.label }],
    };
    return updateGoal(session, withStep);
  }

  if (move.kind === "rewrite" && move.side !== undefined && move.targetId !== undefined && move.hypothesisId !== undefined) {
    const hypothesis = goal.hypotheses.find((candidate) => candidate.id === move.hypothesisId);
    if (hypothesis === undefined) throw new Error("rewrite hypothesis is unavailable");
    const nextGoal = {
      ...goal,
      [move.side]: replaceById(goal[move.side], move.targetId, hypothesis.right),
    } as EquationGoal;
    const withStep = {
      ...nextGoal,
      steps: [...goal.steps, { equation: equationToText(nextGoal), reason: `rewrite with ${hypothesis.name}` }],
    };
    return updateGoal(session, withStep);
  }

  if (move.kind === "close") {
    const solved = { ...goal, status: "solved" as const, steps: [...goal.steps, { equation: equationToText(goal), reason: "reflexivity" }] };
    const updated = updateGoal(session, solved);
    const nextOpen = updated.goals.find((candidate) => candidate.status === "open");
    if (nextOpen !== undefined) return { ...updated, focusedGoalId: nextOpen.id };
    verifyLessonProof(session.lessonId);
    return { ...updated, kernelStatus: "checked" };
  }

  throw new Error(`unsupported proof move ${move.kind}`);
}

export function focusGoal(session: ProofSession, goalId: string): ProofSession {
  if (!session.goals.some((goal) => goal.id === goalId)) throw new Error(`unknown obligation ${goalId}`);
  return { ...session, focusedGoalId: goalId };
}
