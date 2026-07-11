import { describe, expect, it } from "vitest";
import { exprToText, parseProgramExpr } from "../../src/proof/ast.js";
import { definitionsToScript, reduceByDefinition } from "../../src/proof/definitions.js";
import { createLessonSession, enumerateProofMoves } from "../../src/proof/session.js";

describe("generic program language", () => {
  it.each([
    ["negb(false)", "true"],
    ["add(succ(zero), m)", "S (0 + m)"],
    ["append(nil, ys)", "ys"],
    ["append(cons(x, xs), ys)", "x :: xs ++ ys"],
    ["map(f, cons(x, xs))", "f (x) :: map f xs"],
    ["rev(cons(x, xs))", "rev xs ++ x :: []"],
    ["apply(compose(f, g), x)", "f (g (x))"],
  ])("reduces %s from its matching definition clause", (source, expected) => {
    const reduction = reduceByDefinition(parseProgramExpr(source));
    expect(reduction).toBeDefined();
    expect(exprToText(reduction!.expression)).toBe(expected);
  });

  it("derives move labels from the matched clause", () => {
    const session = createLessonSession("bool-compute");
    expect(enumerateProofMoves(session)[0]?.label).toBe("negb case: false");
  });

  it("prints the same declarative definitions used by reduction", () => {
    const script = definitionsToScript(["append"]);
    expect(script).toContain("def append : List A → List A → List A");
    expect(script).toContain("[] ++ ys = ys");
  });
});
