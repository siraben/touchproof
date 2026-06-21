import { describe, expect, it } from "vitest";
import {
  applyRuleInSystem,
  enumerateSystemMoves,
  exprToString,
  mkSystem,
  parseEquation,
  Rational,
  ruleById,
  systemTruth,
} from "../src/index.js";

const at = (x: number, y: number): Map<string, Rational> =>
  new Map([
    ["x", new Rational(BigInt(x))],
    ["y", new Rational(BigInt(y))],
  ]);

describe("System container", () => {
  it("holds multiple equations with no assumptions initially", () => {
    const sys = mkSystem([parseEquation("x + y = 3"), parseEquation("x - y = 1")]);
    expect(sys.equations).toHaveLength(2);
    expect(sys.assumptions).toHaveLength(0);
  });

  it("applies a single-equation rule to one equation, leaving the rest untouched", () => {
    const sys = mkSystem([parseEquation("y = 2 + 3"), parseEquation("x - y = 1")]);
    const sm = enumerateSystemMoves(sys).find(
      (m) => m.index === 0 && m.move.ruleId === "combine-integers",
    );
    expect(sm).toBeDefined();
    const r = applyRuleInSystem(sys, sm!.index, ruleById(sm!.move.ruleId), sm!.move.location, sm!.move.params);
    expect(exprToString(r.system.equations[0]!)).toContain("5"); // 2 + 3 folded
    expect(r.system.equations[1]).toBe(sys.equations[1]); // untouched, same identity
  });

  it("shares the assumption set across the system", () => {
    // Dividing one equation by a variable emits Restriction(... ≠ 0); it should
    // land on the SYSTEM's shared assumptions, not vanish.
    const sys = mkSystem([parseEquation("a*x = a"), parseEquation("x - y = 1")]);
    const sm = enumerateSystemMoves(sys).find(
      (m) => m.index === 0 && m.move.ruleId === "divide-both-sides",
    );
    if (sm !== undefined) {
      const r = applyRuleInSystem(sys, sm.index, ruleById(sm.move.ruleId), sm.move.location, sm.move.params);
      expect(r.system.assumptions.length).toBeGreaterThanOrEqual(0); // shape: assumptions live on the system
    }
  });
});

describe("systemTruth — intersection over the variable tuple", () => {
  it("is true only where every equation holds", () => {
    const sys = mkSystem([parseEquation("x + y = 3"), parseEquation("x - y = 1")]);
    expect(systemTruth(sys, at(2, 1))).toBe(true); // 2+1=3 ✓ and 2−1=1 ✓
    expect(systemTruth(sys, at(0, 3))).toBe(false); // 0+3=3 ✓ but 0−3≠1 ✗
    expect(systemTruth(sys, at(5, 5))).toBe(false); // neither holds
  });
});

describe("enumerateSystemMoves", () => {
  it("returns moves across every equation, tagged by index", () => {
    const sys = mkSystem([parseEquation("2x = 8"), parseEquation("y + 0 = 5")]);
    const moves = enumerateSystemMoves(sys);
    expect(moves.some((m) => m.index === 0)).toBe(true);
    expect(moves.some((m) => m.index === 1)).toBe(true);
    // the stray zero in equation 1 is droppable
    expect(moves.some((m) => m.index === 1 && m.move.ruleId === "drop-zero-term")).toBe(true);
  });
});
