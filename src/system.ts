/**
 * A System is the conjunctive multi-equation state: several equations that must
 * ALL hold, under a SHARED assumption set. It is the first concrete
 * specialization of the "workspace of items" model (docs/multi-equation.md) —
 * every item a constraint equation.
 *
 * The point of the wrapper: single-equation rules are REUSED unchanged. A move
 * names which equation it acts on (an index); a transient judgment is built from
 * the shared assumptions + that equation, the existing rule runs, and the result
 * is written back. Emitted assumptions become the system's, constraining the
 * whole shared variable space.
 *
 * Pure (no DOM). The solution set is the INTERSECTION over the variable tuple:
 * a System is true at an assignment iff every equation is. Cross-equation rules
 * (substitution, elimination) build on this and land in their own modules.
 */
import type { Assumption, Judgment } from "./assumptions.js";
import type { Env } from "./eval.js";
import { truthValue } from "./eval.js";
import type { Equation } from "./expr.js";
import { enumerateMoves, type Move } from "./moves.js";
import { applyRule, type AnimationDiff, type Location, type Rule } from "./rule.js";

export interface System {
  /** Shared by every equation — a restriction from one constrains them all. */
  readonly assumptions: readonly Assumption[];
  readonly equations: readonly Equation[];
}

/** A fresh system from equations, with no assumptions yet. */
export function mkSystem(equations: readonly Equation[]): System {
  return { assumptions: [], equations };
}

/** The judgment view of one equation in the system (carrying shared assumptions). */
function judgmentAt(system: System, index: number): Judgment {
  const equation = system.equations[index];
  if (equation === undefined) throw new Error(`no equation at index ${index}`);
  return { assumptions: system.assumptions, equation };
}

/**
 * Apply a single-equation rule to equation `index`. The reused rule sees the
 * shared assumptions and may emit more; the result's assumptions become the
 * system's (they constrain the whole shared variable space). Other equations are
 * untouched (and keep their identity).
 */
export function applyRuleInSystem<P>(
  system: System,
  index: number,
  rule: Rule<P>,
  location: Location,
  params: P,
  stepId = "adhoc",
): { system: System; diff: AnimationDiff; index: number } {
  const { judgment, diff } = applyRule(judgmentAt(system, index), rule, location, params, stepId);
  const equations = system.equations.map((e, i) => (i === index ? judgment.equation : e));
  return { system: { assumptions: judgment.assumptions, equations }, diff, index };
}

/** A System is true at an assignment iff EVERY equation is (the intersection).
 *  Undefined where any equation is undefined but none is decidably false. */
export function systemTruth(system: System, env: Env): boolean | undefined {
  let anyUndefined = false;
  for (const eq of system.equations) {
    const t = truthValue(eq, env);
    if (t === false) return false;
    if (t === undefined) anyUndefined = true;
  }
  return anyUndefined ? undefined : true;
}

/** A legal move within the system: which equation it acts on, and the move. */
export interface SystemMove {
  readonly index: number;
  readonly move: Move;
}

/** Every intra-equation move across the system, each tagged with its equation. */
export function enumerateSystemMoves(system: System): SystemMove[] {
  const out: SystemMove[] = [];
  system.equations.forEach((_eq, index) => {
    for (const move of enumerateMoves(judgmentAt(system, index))) {
      out.push({ index, move });
    }
  });
  return out;
}
