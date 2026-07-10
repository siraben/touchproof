import { verifyMapCompositionProof } from "./standardLibrary.js";

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
  readonly theorem: string;
  readonly statement: string;
  readonly goals: readonly EquationGoal[];
  readonly focusedGoalId: string;
  readonly kernelStatus: "pending" | "checked";
}

export interface ProofMove {
  readonly id: string;
  readonly kind: "reduce" | "induction" | "rewrite" | "close";
  readonly label: string;
  readonly explanation: string;
  readonly handle: string;
  readonly dropTarget?: string;
  readonly side?: "left" | "right";
  readonly targetId?: string;
  readonly hypothesisId?: string;
}

const compose = (f: Expr, g: Expr): Expr => call("compose", [f, g]);
const map = (f: Expr, value: Expr): Expr => call("map", [f, value]);
const apply = (fn: Expr, value: Expr): Expr => call("apply", [fn, value]);

export function exprToText(expr: Expr): string {
  if (expr.kind === "var") return expr.name;
  if (expr.kind === "ctor") {
    if (expr.name === "nil") return "[]";
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
    theorem: "map_comp",
    statement: "map (f ∘ g) l = map f (map g l)",
    goals: [goal],
    focusedGoalId: goal.id,
    kernelStatus: "pending",
  };
}

export function enumerateProofMoves(session: ProofSession): ProofMove[] {
  const goal = focusedGoal(session);
  if (goal.status === "solved") return [];
  const moves: ProofMove[] = [];
  if (goal.id === "goal-root") {
    const listVariable = allExpressions(goal.left).find((expr) => expr.kind === "var" && expr.name === "l");
    if (listVariable !== undefined) {
      moves.push({
        id: "induction:l",
        kind: "induction",
        label: "Induct on l",
        explanation: "A list is either [] or x :: xs; the recursive case may reuse the claim for xs.",
        handle: listVariable.id,
        dropTarget: "induction-zone",
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

  if (move.kind === "induction") {
    const nil = ctor("nil");
    const x = programVar("x");
    const xs = programVar("xs");
    const cons = ctor("cons", [x, xs]);
    const nilLeft = replaceVariable(goal.left, "l", nil);
    const nilRight = replaceVariable(goal.right, "l", nil);
    const consLeft = replaceVariable(goal.left, "l", cons);
    const consRight = replaceVariable(goal.right, "l", cons);
    const ihLeft = replaceVariable(goal.left, "l", xs);
    const ihRight = replaceVariable(goal.right, "l", xs);
    const nilGoal: EquationGoal = {
      id: "goal-nil",
      label: "empty list",
      context: goal.context.filter((entry) => !entry.startsWith("l :")),
      hypotheses: [], left: nilLeft, right: nilRight, status: "open",
      steps: [{ equation: `${exprToText(nilLeft)} = ${exprToText(nilRight)}`, reason: "empty-list obligation" }],
    };
    const consGoal: EquationGoal = {
      id: "goal-cons",
      label: "x :: xs",
      context: [...goal.context.filter((entry) => !entry.startsWith("l :")), "x : A", "xs : List A"],
      hypotheses: [{ id: "ih-xs", name: "IH", left: ihLeft, right: ihRight }],
      left: consLeft, right: consRight, status: "open",
      steps: [{ equation: `${exprToText(consLeft)} = ${exprToText(consRight)}`, reason: "constructor obligation" }],
    };
    return { ...session, goals: [nilGoal, consGoal], focusedGoalId: nilGoal.id };
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
    verifyMapCompositionProof();
    return { ...updated, kernelStatus: "checked" };
  }

  throw new Error(`unsupported proof move ${move.kind}`);
}

export function focusGoal(session: ProofSession, goalId: string): ProofSession {
  if (!session.goals.some((goal) => goal.id === goalId)) throw new Error(`unknown obligation ${goalId}`);
  return { ...session, focusedGoalId: goalId };
}
