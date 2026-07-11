import { describe, expect, it } from "vitest";
import { termToString } from "../../src/kernel/term.js";
import {
  elaborateTypeSource,
  parseTypeExpr,
  typeExprToString,
  typeVariables,
  TypeParseError,
} from "../../src/proof/types.js";

describe("proof-language type AST", () => {
  it.each([
    ["Bool", "Bool"],
    ["Nat", "Nat"],
    ["List A", "List A"],
    ["A → B", "A → B"],
    ["(A → B) → List A → List B", "(A → B) → List A → List B"],
    ["(B → C) → (A → B) → A → C", "(B → C) → (A → B) → A → C"],
    ["List A → List A → List A", "List A → List A → List A"],
    ["List (A → B)", "List (A → B)"],
  ])("parses and round-trips %s", (source, printed) => {
    expect(typeExprToString(parseTypeExpr(source))).toBe(printed);
  });

  it.each([
    ["List A", ["A"]],
    ["(A → B) → List A → List B", ["A", "B"]],
    ["(B → C) → (A → B) → A → C", ["B", "C", "A"]],
    ["Nat", []],
    ["List Nat", []],
  ])("collects the type variables of %s (datatypes excluded)", (source, expected) => {
    expect([...typeVariables(parseTypeExpr(source))]).toEqual(expected);
  });

  it.each([
    ["Bool", "Bool"],
    ["Nat", "Nat"],
    ["List A", "List A"],
    ["A → B", "(Π _ : A, B)"],
    ["(A → B) → List A → List B", "(Π _ : (Π _ : A, B), (Π _ : List A, List B))"],
    ["Type", "Type 0"],
    ["Prop", "Type 0"],
  ])("elaborates %s to the right kernel term", (source, kernel) => {
    const vars = typeVariables(parseTypeExpr(source));
    expect(termToString(elaborateTypeSource(source, vars))).toBe(kernel);
  });

  it("rejects an unbound type variable rather than defaulting it", () => {
    expect(() => elaborateTypeSource("List A", new Set())).toThrow(TypeParseError);
    expect(() => elaborateTypeSource("A → B", new Set())).toThrow(TypeParseError);
  });

  it("rejects an unknown named type", () => {
    expect(() => elaborateTypeSource("Foo", new Set())).toThrow(TypeParseError);
    expect(() => elaborateTypeSource("List Foo", new Set(["A"]))).toThrow(TypeParseError);
  });

  it("rejects applying a type variable and malformed arrows", () => {
    expect(() => elaborateTypeSource("A B", new Set(["A", "B"]))).toThrow(TypeParseError);
    expect(() => parseTypeExpr("A →")).toThrow(TypeParseError);
    expect(() => parseTypeExpr("→ A")).toThrow(TypeParseError);
    expect(() => parseTypeExpr("(A")).toThrow(TypeParseError);
  });
});
