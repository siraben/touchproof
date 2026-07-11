import { describe, expect, it } from "vitest";
import { termToString } from "../../src/kernel/term.js";
import { parseProgramExpr } from "../../src/proof/ast.js";
import {
  contextTypeVariables,
  contextTypes,
  ElaborationError,
  expressionElaborator,
} from "../../src/proof/elaborate.js";

function elaborate(context: readonly string[], source: string): string {
  const elaborator = expressionElaborator(contextTypes(context), contextTypeVariables(context));
  return termToString(elaborator.term(parseProgramExpr(source)));
}

describe("typed program elaboration", () => {
  it("threads element types into polymorphic constants", () => {
    const context = ["A, B : Type", "f : A → B", "x : A", "xs : List A", "ys : List A"];
    expect(elaborate(context, "append(xs, ys)")).toBe("append A xs ys");
    expect(elaborate(context, "map(f, xs)")).toBe("map A B f xs");
    expect(elaborate(context, "cons(apply(f, x), map(f, xs))")).toBe("cons B (f x) (map A B f xs)");
    expect(elaborate(context, "length(xs)")).toBe("length A xs");
  });

  it("elaborates compose to its three-type-parameter form", () => {
    const context = ["A, B, C : Type", "f : B → C", "g : A → B", "x : A"];
    expect(elaborate(context, "apply(compose(f, g), x)")).toBe("compose A B C f g x");
  });

  it("infers a bare nil's element type from its expected position", () => {
    const context = ["A : Type", "x : A"];
    expect(elaborate(context, "cons(x, nil)")).toBe("cons A x (nil A)");
  });

  it("rejects a genuinely ambiguous bare nil", () => {
    // No list variable, two candidate type variables: the element is ambiguous.
    const context = ["A, B : Type"];
    const elaborator = expressionElaborator(contextTypes(context), contextTypeVariables(context));
    expect(() => elaborator.term(parseProgramExpr("nil"))).toThrow(ElaborationError);
  });

  it("rejects an untyped program variable rather than defaulting it", () => {
    const elaborator = expressionElaborator(new Map(), new Set());
    expect(() => elaborator.term(parseProgramExpr("mystery"))).toThrow(ElaborationError);
  });
});
