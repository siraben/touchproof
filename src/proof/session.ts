import { verifyLessonProof } from "./standardLibrary.js";

export type Expr =
  | { readonly id: string; readonly kind: "var"; readonly name: string }
  | { readonly id: string; readonly kind: "ctor"; readonly name: string; readonly args: readonly Expr[] }
  | { readonly id: string; readonly kind: "call"; readonly name: string; readonly args: readonly Expr[] };

let nextId = 0;
const id = (prefix: string): string => `${prefix}-${++nextId}`;
export const programVar = (name: string, nodeId = id(name)): Expr => ({ id: nodeId, kind: "var", name });
export const ctor = (name: string, args: readonly Expr[] = [], nodeId = id(name)): Expr => ({
  id: nodeId, kind: "ctor", name, args,
});
export const call = (name: string, args: readonly Expr[], nodeId = id(name)): Expr => ({
  id: nodeId, kind: "call", name, args,
});

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

const compose = (f: Expr, g: Expr): Expr => call("compose", [f, g]);
const map = (f: Expr, value: Expr): Expr => call("map", [f, value]);
const apply = (fn: Expr, value: Expr): Expr => call("apply", [fn, value]);

export function exprToText(expr: Expr): string {
  if (expr.kind === "var") return expr.name;
  if (expr.kind === "ctor") {
    if (expr.name === "nil") return "[]";
    if (expr.name === "zero") return "0";
    if (expr.name === "succ" && expr.args.length === 1) return `S (${exprToText(expr.args[0]!)})`;
    if (expr.name === "cons" && expr.args.length === 2) {
      return `${exprToText(expr.args[0]!)} :: ${exprToText(expr.args[1]!)}`;
    }
    return expr.args.length === 0 ? expr.name : `${expr.name} ${expr.args.map(exprToText).join(" ")}`;
  }
  if (expr.name === "compose" && expr.args.length === 2) {
    return `(${exprToText(expr.args[0]!)} ∘ ${exprToText(expr.args[1]!)})`;
  }
  if (expr.name === "apply" && expr.args.length === 2) {
    return `${exprToText(expr.args[0]!)} (${exprToText(expr.args[1]!)})`;
  }
  if (expr.name === "map" && expr.args.length === 2) {
    const fn = expr.args[0]!;
    const value = expr.args[1]!;
    const valueText = exprToText(value);
    const renderedValue = value.kind === "var" || (value.kind === "ctor" && value.name === "nil")
      ? valueText
      : `(${valueText})`;
    return `map ${exprToText(fn)} ${renderedValue}`;
  }
  if (expr.name === "negb" && expr.args.length === 1) {
    const value = expr.args[0]!;
    const text = exprToText(value);
    return `negb ${value.kind === "var" || value.kind === "ctor" ? text : `(${text})`}`;
  }
  if (expr.name === "add" && expr.args.length === 2) {
    return `${exprToText(expr.args[0]!)} + ${exprToText(expr.args[1]!)}`;
  }
  if (expr.name === "append" && expr.args.length === 2) {
    return `${exprToText(expr.args[0]!)} ++ ${exprToText(expr.args[1]!)}`;
  }
  if (expr.name === "rev" && expr.args.length === 1) {
    const value = expr.args[0]!;
    const text = exprToText(value);
    return `rev ${value.kind === "var" || (value.kind === "ctor" && value.name === "nil") ? text : `(${text})`}`;
  }
  return `${expr.name} ${expr.args.map((arg) => {
    const text = exprToText(arg);
    return arg.kind === "call" && arg.name !== "compose" ? `(${text})` : text;
  }).join(" ")}`;
}

export function equationToText(goal: Pick<EquationGoal, "left" | "right">): string {
  return `${exprToText(goal.left)} = ${exprToText(goal.right)}`;
}

function cloneFresh(expr: Expr): Expr {
  if (expr.kind === "var") return programVar(expr.name);
  return expr.kind === "ctor"
    ? ctor(expr.name, expr.args.map(cloneFresh))
    : call(expr.name, expr.args.map(cloneFresh));
}

function expressionEqual(left: Expr, right: Expr): boolean {
  return left.kind === right.kind && left.name === right.name
    && left.kind !== "var" && right.kind !== "var"
      ? left.args.length === right.args.length && left.args.every((arg, index) => expressionEqual(arg, right.args[index]!))
      : left.kind === "var" && right.kind === "var" && left.name === right.name;
}

function replaceVariable(expr: Expr, name: string, replacement: Expr): Expr {
  if (expr.kind === "var") return expr.name === name ? cloneFresh(replacement) : expr;
  const args = expr.args.map((arg) => replaceVariable(arg, name, replacement));
  return expr.kind === "ctor" ? { ...expr, args } : { ...expr, args };
}

function replaceById(expr: Expr, targetId: string, replacement: Expr): Expr {
  if (expr.id === targetId) {
    const fresh = cloneFresh(replacement);
    return { ...fresh, id: targetId };
  }
  if (expr.kind === "var") return expr;
  const args = expr.args.map((arg) => replaceById(arg, targetId, replacement));
  return { ...expr, args };
}

function allExpressions(expr: Expr): Expr[] {
  return expr.kind === "var" ? [expr] : [expr, ...expr.args.flatMap(allExpressions)];
}

function reduce(expr: Expr): Expr | undefined {
  if (expr.kind !== "call") return undefined;
  if (expr.name === "negb" && expr.args.length === 1) {
    const value = expr.args[0];
    if (value?.kind === "ctor" && value.name === "true") return ctor("false", [], expr.id);
    if (value?.kind === "ctor" && value.name === "false") return ctor("true", [], expr.id);
  }
  if (expr.name === "add" && expr.args.length === 2) {
    const [left, right] = expr.args;
    if (left?.kind === "ctor" && left.name === "zero" && right !== undefined) return { ...cloneFresh(right), id: expr.id };
    if (left?.kind === "ctor" && left.name === "succ" && left.args.length === 1 && right !== undefined) {
      return ctor("succ", [call("add", [cloneFresh(left.args[0]!), cloneFresh(right)])], expr.id);
    }
  }
  if (expr.name === "append" && expr.args.length === 2) {
    const [left, right] = expr.args;
    if (left?.kind === "ctor" && left.name === "nil" && right !== undefined) return { ...cloneFresh(right), id: expr.id };
    if (left?.kind === "ctor" && left.name === "cons" && left.args.length === 2 && right !== undefined) {
      return ctor("cons", [cloneFresh(left.args[0]!), call("append", [cloneFresh(left.args[1]!), cloneFresh(right)])], expr.id);
    }
  }
  if (expr.name === "rev" && expr.args.length === 1) {
    const value = expr.args[0];
    if (value?.kind === "ctor" && value.name === "nil") return ctor("nil", [], expr.id);
    if (value?.kind === "ctor" && value.name === "cons" && value.args.length === 2) {
      return call("append", [
        call("rev", [cloneFresh(value.args[1]!)]),
        ctor("cons", [cloneFresh(value.args[0]!), ctor("nil")]),
      ], expr.id);
    }
  }
  if (expr.name === "map" && expr.args.length === 2) {
    const [fn, list] = expr.args;
    if (fn === undefined || list === undefined) return undefined;
    if (list.kind === "ctor" && list.name === "nil") return { ...list, id: expr.id };
    if (list.kind === "ctor" && list.name === "cons" && list.args.length === 2) {
      return ctor("cons", [apply(cloneFresh(fn), cloneFresh(list.args[0]!)), map(cloneFresh(fn), cloneFresh(list.args[1]!))], expr.id);
    }
  }
  if (expr.name === "apply" && expr.args.length === 2) {
    const [fn, value] = expr.args;
    if (fn?.kind === "call" && fn.name === "compose" && fn.args.length === 2 && value !== undefined) {
      return apply(cloneFresh(fn.args[0]!), apply(cloneFresh(fn.args[1]!), cloneFresh(value)));
    }
  }
  return undefined;
}

function focusedGoal(session: ProofSession): EquationGoal {
  const goal = session.goals.find((candidate) => candidate.id === session.focusedGoalId);
  if (goal === undefined) throw new Error("focused proof obligation does not exist");
  return goal;
}

export function createMapCompositionSession(): ProofSession {
  const f = programVar("f", "var-f");
  const g = programVar("g", "var-g");
  const list = programVar("l", "var-l");
  const left = map(compose(f, g), list);
  const right = map(f, map(g, programVar("l")));
  const goal: EquationGoal = {
    id: "goal-root",
    label: "map composition",
    context: ["A : Type", "f : A → A", "g : A → A", "l : List A"],
    hypotheses: [],
    left,
    right,
    status: "open",
    steps: [{ equation: `${exprToText(left)} = ${exprToText(right)}`, reason: "theorem statement" }],
  };
  return {
    lessonId: "map-composition",
    theorem: "map_comp",
    statement: "map (f ∘ g) l = map f (map g l)",
    analysis: { kind: "induction", variable: "l", type: "List" },
    goals: [goal],
    focusedGoalId: goal.id,
    kernelStatus: "pending",
  };
}

function rootSession(
  lessonId: string,
  theorem: string,
  statement: string,
  context: readonly string[],
  left: Expr,
  right: Expr,
  analysis?: NonNullable<ProofSession["analysis"]>,
): ProofSession {
  const goal: EquationGoal = {
    id: "goal-root",
    label: lessonCatalog.find((lesson) => lesson.id === lessonId)?.title ?? theorem,
    context,
    hypotheses: [],
    left,
    right,
    status: "open",
    steps: [{ equation: `${exprToText(left)} = ${exprToText(right)}`, reason: "theorem statement" }],
  };
  return {
    lessonId,
    theorem,
    statement,
    ...(analysis === undefined ? {} : { analysis }),
    goals: [goal],
    focusedGoalId: goal.id,
    kernelStatus: "pending",
  };
}

export function createLessonSession(lessonId: string): ProofSession {
  if (lessonId === "map-composition") return createMapCompositionSession();
  if (lessonId === "bool-compute") {
    return rootSession(
      lessonId,
      "negb_false",
      "negb false = true",
      [],
      call("negb", [ctor("false")]),
      ctor("true"),
    );
  }
  if (lessonId === "bool-involution") {
    const b = programVar("b", "var-b");
    return rootSession(
      lessonId,
      "negb_involutive",
      "negb (negb b) = b",
      ["b : Bool"],
      call("negb", [call("negb", [b])]),
      programVar("b"),
      { kind: "cases", variable: "b", type: "Bool" },
    );
  }
  if (lessonId === "nat-add-zero") {
    const n = programVar("n", "var-n");
    return rootSession(
      lessonId,
      "add_zero_right",
      "n + 0 = n",
      ["n : Nat"],
      call("add", [n, ctor("zero")]),
      programVar("n"),
      { kind: "induction", variable: "n", type: "Nat" },
    );
  }
  if (lessonId === "nat-add-example") {
    const zero = ctor("zero");
    const one = ctor("succ", [zero]);
    const two = ctor("succ", [ctor("succ", [ctor("zero")])]);
    const three = ctor("succ", [ctor("succ", [ctor("succ", [ctor("zero")])])]);
    return rootSession(
      lessonId,
      "two_plus_one",
      "2 + 1 = 3",
      [],
      call("add", [two, one]),
      three,
    );
  }
  if (lessonId === "list-append-nil") {
    const xs = programVar("xs", "var-xs");
    return rootSession(
      lessonId,
      "append_nil_right",
      "xs ++ [] = xs",
      ["A : Type", "xs : List A"],
      call("append", [xs, ctor("nil")]),
      programVar("xs"),
      { kind: "induction", variable: "xs", type: "List" },
    );
  }
  if (lessonId === "list-map-append") {
    return rootSession(
      lessonId,
      "map_append",
      "map f (xs ++ ys) = map f xs ++ map f ys",
      ["A, B : Type", "f : A → B", "xs : List A", "ys : List A"],
      call("map", [programVar("f", "var-f"), call("append", [programVar("xs", "var-xs"), programVar("ys", "var-ys")])]),
      call("append", [call("map", [programVar("f"), programVar("xs")]), call("map", [programVar("f"), programVar("ys")])]),
      { kind: "induction", variable: "xs", type: "List" },
    );
  }
  if (lessonId === "list-rev-append") {
    return rootSession(
      lessonId,
      "rev_append",
      "rev (xs ++ ys) = rev ys ++ rev xs",
      ["A : Type", "xs : List A", "ys : List A"],
      call("rev", [call("append", [programVar("xs", "var-xs"), programVar("ys", "var-ys")])]),
      call("append", [call("rev", [programVar("ys")]), call("rev", [programVar("xs")])]),
      { kind: "induction", variable: "xs", type: "List" },
    );
  }
  if (lessonId === "list-rev-involution") {
    return rootSession(
      lessonId,
      "rev_involutive",
      "rev (rev xs) = xs",
      ["A : Type", "xs : List A"],
      call("rev", [call("rev", [programVar("xs", "var-xs")])]),
      programVar("xs"),
      { kind: "induction", variable: "xs", type: "List" },
    );
  }
  throw new Error(`unknown lesson ${lessonId}`);
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
          ? `Analyze ${session.analysis.variable}`
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
      if (reduce(expression) !== undefined) {
        moves.push({
          id: `reduce:${side}:${expression.id}`,
          kind: "reduce",
          label: expression.name === "map" ? "Unfold map" : "Unfold composition",
          explanation: "Apply the matching defining equation to this expression.",
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
    const constructors: Array<{
      label: string;
      value: Expr;
      context: readonly string[];
      recursive?: Expr;
    }> = analyzedType === "Bool"
      ? [
          { label: "true", value: ctor("true"), context: baseContext },
          { label: "false", value: ctor("false"), context: baseContext },
        ]
      : analyzedType === "Nat"
        ? [
            { label: "zero", value: ctor("zero"), context: baseContext },
            { label: "succ n", value: ctor("succ", [programVar("n")]), context: [...baseContext, "n : Nat"], recursive: programVar("n") },
          ]
        : [
            { label: "empty list", value: ctor("nil"), context: baseContext },
            { label: "x :: xs", value: ctor("cons", [programVar("x"), programVar("xs")]), context: [...baseContext, "x : A", "xs : List A"], recursive: programVar("xs") },
          ];
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
    if (session.lessonId === "list-rev-append") {
      obligations = obligations.map((obligation, index) => {
        const revYs = call("rev", [programVar("ys")]);
        if (index === 0) {
          return { ...obligation, hypotheses: [...obligation.hypotheses, {
            id: "lemma-append-nil",
            name: "append_nil",
            left: call("append", [revYs, ctor("nil")]),
            right: cloneFresh(revYs),
          }] };
        }
        const revXs = call("rev", [programVar("xs")]);
        const singleton = ctor("cons", [programVar("x"), ctor("nil")]);
        return { ...obligation, hypotheses: [...obligation.hypotheses, {
          id: "lemma-append-assoc",
          name: "append_assoc",
          left: call("append", [call("append", [revYs, revXs]), singleton]),
          right: call("append", [cloneFresh(revYs), call("append", [cloneFresh(revXs), cloneFresh(singleton)])]),
        }] };
      });
    }
    if (session.lessonId === "list-rev-involution") {
      obligations = obligations.map((obligation, index) => {
        if (index === 0) return obligation;
        const xs = programVar("xs");
        const singleton = ctor("cons", [programVar("x"), ctor("nil")]);
        return { ...obligation, hypotheses: [...obligation.hypotheses, {
          id: "lemma-rev-append",
          name: "rev_append",
          left: call("rev", [call("append", [call("rev", [xs]), singleton])]),
          right: call("append", [call("rev", [cloneFresh(singleton)]), call("rev", [call("rev", [cloneFresh(xs)])])]),
        }] };
      });
    }
    return { ...session, goals: obligations, focusedGoalId: obligations[0]!.id };
  }

  if (move.kind === "reduce" && move.side !== undefined && move.targetId !== undefined) {
    const target = allExpressions(goal[move.side]).find((expr) => expr.id === move.targetId);
    const replacement = target === undefined ? undefined : reduce(target);
    if (replacement === undefined) throw new Error("reduction target is no longer reducible");
    const nextGoal = {
      ...goal,
      [move.side]: replaceById(goal[move.side], move.targetId, replacement),
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
