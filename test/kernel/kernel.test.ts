import { describe, expect, it } from "vitest";
import { check, definitionallyEqual, infer, KernelError, normalize } from "../../src/kernel/checker.js";
import { app, arrow, equal, lambda, refl, subst, type, variable } from "../../src/kernel/term.js";
import { mapCompositionProof, touchProofEnvironment, verifyMapCompositionProof } from "../../src/proof/standardLibrary.js";

describe("dependent kernel", () => {
  it("checks dependent functions and beta equality", () => {
    const identity = lambda("A", type(0), lambda("x", variable("A"), variable("x")));
    const inferred = infer(identity, new Map(), new Map());
    expect(inferred.kind).toBe("pi");

    const reduced = normalize(app(lambda("x", type(0), variable("x")), type(0)), new Map());
    expect(definitionallyEqual(reduced, type(0), new Map())).toBe(true);
  });

  it("checks equality elimination and reduces subst over reflexivity", () => {
    const context = new Map([["A", type(0)], ["x", variable("A")]] as const);
    const motive = lambda("_", variable("A"), type(0));
    const transported = subst(refl(variable("x")), motive, variable("A"));
    expect(definitionallyEqual(normalize(transported, new Map()), variable("A"), new Map())).toBe(true);
    expect(() => infer(transported, context, new Map())).not.toThrow();
  });

  it("rejects ill-typed applications", () => {
    const bad = app(lambda("x", type(0), variable("x")), lambda("y", type(0), variable("y")));
    expect(() => infer(bad, new Map(), new Map())).toThrow(KernelError);
  });

  it("independently checks the map-composition induction term", () => {
    const theorem = mapCompositionProof();
    expect(() => check(theorem.term, theorem.type, new Map(), touchProofEnvironment())).not.toThrow();
    expect(() => verifyMapCompositionProof()).not.toThrow();
  });

  it("does not accept reflexivity for unequal terms", () => {
    const env = touchProofEnvironment();
    const expected = equal(variable("A"), variable("x"), variable("y"));
    const context = new Map([
      ["A", type(0)],
      ["x", variable("A")],
      ["y", variable("A")],
    ]);
    expect(() => check(refl(variable("x")), expected, context, env)).toThrow(KernelError);
  });
});
