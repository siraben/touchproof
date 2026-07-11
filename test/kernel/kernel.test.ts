import { describe, expect, it } from "vitest";
import { assertAxiomFree, check, checkDeclaration, declareAxiom, declareInductive, declareParameterizedInductive, definitionallyEqual, emptyEnvironment, environmentAxioms, infer, KernelError, normalize } from "../../src/kernel/checker.js";
import { app, apps, constant, equal, lambda, letIn, pi, recursor, refl, subst, type, variable } from "../../src/kernel/term.js";
import {
  addZeroRightProof,
  appendNilRightProof,
  booleanComputationProof,
  booleanInvolutionProof,
  mapCompositionProof,
  mapAppendProof,
  natAdditionExampleProof,
  revAppendProof,
  revInvolutionProof,
  touchProofEnvironment,
  verifyLessonProof,
  verifyMapCompositionProof,
} from "../../src/proof/standardLibrary.js";

describe("dependent kernel", () => {
  it("checks dependent functions and beta equality", () => {
    const identity = lambda("A", type(0), lambda("x", variable("A"), variable("x")));
    const inferred = infer(identity, new Map(), emptyEnvironment());
    expect(inferred.kind).toBe("pi");

    const reduced = normalize(app(lambda("x", type(0), variable("x")), type(0)), emptyEnvironment());
    expect(definitionallyEqual(reduced, type(0), emptyEnvironment())).toBe(true);
  });

  it("checks local definitions and computes by zeta reduction", () => {
    const environment = declareInductive("Bit", [
      { name: "low", fields: [] },
      { name: "high", fields: [] },
    ], emptyEnvironment());
    const identityType = pi("x", constant("Bit"), constant("Bit"));
    const term = letIn(
      "identity",
      identityType,
      lambda("x", constant("Bit"), variable("x")),
      app(variable("identity"), constant("high")),
    );
    expect(definitionallyEqual(term, constant("high"), environment)).toBe(true);
    expect(definitionallyEqual(infer(term, new Map(), environment), constant("Bit"), environment)).toBe(true);
  });

  it("checks equality elimination and reduces subst over reflexivity", () => {
    const context = new Map([["A", type(0)], ["x", variable("A")]] as const);
    const motive = lambda("_", variable("A"), type(0));
    const transported = subst(refl(variable("x")), motive, variable("A"));
    expect(definitionallyEqual(normalize(transported, emptyEnvironment()), variable("A"), emptyEnvironment())).toBe(true);
    expect(() => infer(transported, context, emptyEnvironment())).not.toThrow();
  });

  it("rejects ill-typed applications", () => {
    const bad = app(lambda("x", type(0), variable("x")), lambda("y", type(0), variable("y")));
    expect(() => infer(bad, new Map(), emptyEnvironment())).toThrow(KernelError);
  });

  it("does not capture free variables during alpha conversion", () => {
    const freeA = pi("x", type(0), variable("A"));
    const boundA = pi("A", type(0), variable("A"));
    expect(definitionallyEqual(freeA, boundA, emptyEnvironment())).toBe(false);
  });

  it("declares and computes with a strictly-positive inductive type", () => {
    const environment = declareInductive("Bit", [
      { name: "off", fields: [] },
      { name: "on", fields: [] },
    ], emptyEnvironment());
    const motive = lambda("_", constant("Bit"), constant("Bit"));
    const flipped = recursor("Bit", motive, [constant("on"), constant("off")], constant("off"));
    expect(definitionallyEqual(flipped, constant("on"), environment)).toBe(true);
    expect(() => infer(flipped, new Map(), environment)).not.toThrow();
  });

  it("declares and eliminates a parameterized datatype", () => {
    let environment = declareInductive("Element", [{ name: "element", fields: [] }], emptyEnvironment());
    environment = declareParameterizedInductive("Option", [{ name: "A", type: type(0) }], [
      { name: "none", fields: [] },
      { name: "some", fields: [{ name: "value", type: variable("A") }] },
    ], environment);
    const elementType = constant("Element");
    const element = constant("element");
    const someElement = apps(constant("some"), elementType, element);
    const extracted = recursor(
      "Option",
      lambda("_", apps(constant("Option"), elementType), elementType),
      [element, lambda("value", elementType, variable("value"))],
      someElement,
      [elementType],
    );
    expect(definitionallyEqual(extracted, element, environment)).toBe(true);
    expect(definitionallyEqual(infer(extracted, new Map(), environment), elementType, environment)).toBe(true);
    expect(() => infer(recursor("Option", lambda("_", apps(constant("Option"), elementType), elementType), [element, lambda("value", elementType, variable("value"))], someElement), new Map(), environment))
      .toThrow(KernelError);
  });

  it("supports empty inductives and rejects malformed declarations", () => {
    expect(() => declareInductive("False", [], emptyEnvironment())).not.toThrow();
    expect(() => declareInductive("Huge", [
      { name: "pack", fields: [{ name: "A", type: type(1) }] },
    ], emptyEnvironment())).toThrow(KernelError);
    expect(() => declareInductive("Bad", [
      { name: "bad", fields: [{ name: "f", type: pi("_", constant("Bad"), type(0)) }] },
    ], emptyEnvironment())).toThrow(KernelError);
    expect(() => declareInductive("Dup", [
      { name: "dup", fields: [{ name: "x", type: type(0) }, { name: "x", type: type(0) }] },
    ], emptyEnvironment())).toThrow(KernelError);
  });

  it("keeps checked environments append-only", () => {
    const environment = checkDeclaration("U", { type: type(1), value: type(0) }, emptyEnvironment());
    expect(() => checkDeclaration("U", { type: type(1), value: type(0) }, environment)).toThrow(KernelError);
  });

  it("separates checked definitions from explicit assumptions", () => {
    const malformed = { type: type(1) } as unknown as Parameters<typeof checkDeclaration>[1];
    expect(() => checkDeclaration("bodyless", malformed, emptyEnvironment())).toThrow("requires a checked value");
    const forged = { type: type(1), value: type(0), kind: "inductive" } as unknown as Parameters<typeof checkDeclaration>[1];
    expect(() => checkDeclaration("forged", forged, emptyEnvironment())).toThrow("metadata is generated only by the kernel");

    const assumed = declareAxiom("Choice", type(0), emptyEnvironment());
    expect(environmentAxioms(assumed)).toEqual(["Choice"]);
    expect(() => assertAxiomFree(assumed)).toThrow("environment contains axioms: Choice");
  });

  it("rejects structurally forged environment maps", () => {
    const forged = new Map() as unknown as Parameters<typeof infer>[2];
    expect(() => infer(type(0), new Map(), forged)).toThrow("untrusted kernel environment");
    const checked = emptyEnvironment() as unknown as { readonly set?: unknown };
    expect(checked.set).toBeUndefined();
  });

  it("ships no unproved standard-library constants", () => {
    for (const [name, declaration] of touchProofEnvironment()) {
      const generated = declaration.inductive !== undefined || declaration.constructorInfo !== undefined;
      expect(declaration.value !== undefined || generated, `${name} is an unchecked axiom`).toBe(true);
    }
  });

  it("independently checks the map-composition induction term", () => {
    const theorem = mapCompositionProof();
    expect(() => check(theorem.term, theorem.type, new Map(), touchProofEnvironment())).not.toThrow();
    expect(() => verifyMapCompositionProof()).not.toThrow();
  });

  it.each([
    ["bool-compute", booleanComputationProof],
    ["bool-involution", booleanInvolutionProof],
    ["nat-add-example", natAdditionExampleProof],
    ["nat-add-zero", addZeroRightProof],
    ["list-append-nil", appendNilRightProof],
    ["list-map-append", mapAppendProof],
    ["list-rev-append", revAppendProof],
    ["list-rev-involution", revInvolutionProof],
  ] as const)("checks the %s curriculum certificate", (lessonId, build) => {
    const theorem = build();
    expect(() => check(theorem.term, theorem.type, new Map(), touchProofEnvironment())).not.toThrow();
    expect(() => verifyLessonProof(lessonId)).not.toThrow();
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
