import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  call,
  ctor,
  expressionEqual,
  exprToText,
  parseProgramExpr,
  programVar,
  ProgramParseError,
  type Expr,
} from "../../src/proof/ast.js";
import { infixl, infixr, operatorTable } from "../../src/proof/fixity.js";

const variables = ["a", "b", "c", "x", "xs", "ys", "zs", "f", "g"] as const;

/** Expression trees over exactly the operator-table fragment the concrete syntax can spell. */
const operatorExpr: fc.Arbitrary<Expr> = fc.letrec<{ expr: Expr }>((tie) => ({
  expr: fc.oneof(
    { maxDepth: 6, withCrossShrink: true },
    fc.oneof(
      fc.constantFrom(...variables).map((name) => programVar(name)),
      fc.constant(0).map(() => ctor("nil")),
      fc.constant(0).map(() => ctor("zero")),
    ),
    fc.tuple(fc.constantFrom(...operatorTable), tie("expr"), tie("expr")).map(([operator, left, right]) =>
      operator.name === "cons" ? ctor("cons", [left, right]) : call(operator.name, [left, right])),
  ),
})).expr;

describe("fixity-driven parsing and printing", () => {
  it("round-trips printed expressions over the operator table (parse ∘ print = id)", () => {
    fc.assert(
      fc.property(operatorExpr, (tree) => {
        expect(expressionEqual(parseProgramExpr(exprToText(tree)), tree)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it.each([
    // left associativity: + at level 6
    ["a + b + c", call("add", [call("add", [programVar("a"), programVar("b")]), programVar("c")])],
    // right associativity: :: and ++ at level 5
    ["x :: ys :: zs", ctor("cons", [programVar("x"), ctor("cons", [programVar("ys"), programVar("zs")])])],
    ["xs ++ ys ++ zs", call("append", [programVar("xs"), call("append", [programVar("ys"), programVar("zs")])])],
    // equal precedence, same associativity: Haskell reading x :: (xs ++ ys)
    ["x :: xs ++ ys", ctor("cons", [programVar("x"), call("append", [programVar("xs"), programVar("ys")])])],
    // mixed precedence: + (6) binds tighter than :: (5)
    ["a + b :: zs", ctor("cons", [call("add", [programVar("a"), programVar("b")]), programVar("zs")])],
    // composition binds tightest (9)
    ["f ∘ g ∘ f", call("compose", [programVar("f"), call("compose", [programVar("g"), programVar("f")])])],
    // parentheses override the table
    ["(x :: xs) ++ ys", call("append", [ctor("cons", [programVar("x"), programVar("xs")]), programVar("ys")])],
    ["a + (b + c)", call("add", [programVar("a"), call("add", [programVar("b"), programVar("c")])])],
    // propositional connectives: → is right-associative at 3, ∧ binds tighter at 4
    ["a → b → a", call("imp", [programVar("a"), call("imp", [programVar("b"), programVar("a")])])],
    ["a ∧ b → b ∧ a", call("imp", [call("and", [programVar("a"), programVar("b")]), call("and", [programVar("b"), programVar("a")])])],
    ["a ∧ b ∧ c", call("and", [programVar("a"), call("and", [programVar("b"), programVar("c")])])],
  ])("parses %s with the declared fixities", (source, expected) => {
    expect(expressionEqual(parseProgramExpr(source), expected)).toBe(true);
  });

  it.each([
    [call("add", [call("add", [programVar("a"), programVar("b")]), programVar("c")]), "a + b + c"],
    [call("add", [programVar("a"), call("add", [programVar("b"), programVar("c")])]), "a + (b + c)"],
    [ctor("cons", [programVar("x"), call("append", [programVar("xs"), programVar("ys")])]), "x :: xs ++ ys"],
    [call("append", [ctor("cons", [programVar("x"), programVar("xs")]), programVar("ys")]), "(x :: xs) ++ ys"],
    [call("compose", [call("compose", [programVar("f"), programVar("g")]), programVar("f")]), "(f ∘ g) ∘ f"],
    [call("compose", [programVar("f"), call("compose", [programVar("g"), programVar("f")])]), "f ∘ g ∘ f"],
    [call("apply", [call("compose", [programVar("f"), programVar("g")]), programVar("x")]), "(f ∘ g) (x)"],
    [call("map", [call("compose", [programVar("f"), programVar("g")]), programVar("xs")]), "map (f ∘ g) xs"],
    [ctor("succ", [call("add", [ctor("zero"), programVar("a")])]), "S (0 + a)"],
    // implication prints right-associated without parentheses…
    [call("imp", [programVar("a"), call("imp", [programVar("b"), programVar("a")])]), "a → b → a"],
    // …and parenthesizes a left-nested antecedent
    [call("imp", [call("imp", [programVar("a"), programVar("b")]), programVar("a")]), "(a → b) → a"],
    [call("imp", [call("and", [programVar("a"), programVar("b")]), call("and", [programVar("b"), programVar("a")])]), "a ∧ b → b ∧ a"],
    [call("and", [call("and", [programVar("a"), programVar("b")]), programVar("c")]), "(a ∧ b) ∧ c"],
  ])("prints with the minimal parentheses the table dictates", (tree, expected) => {
    expect(exprToText(tree)).toBe(expected);
  });

  it("rejects chains that mix associativities at one precedence level instead of guessing", () => {
    const table = [infixl(5, "+", "add"), infixr(5, "::", "cons")];
    expect(() => parseProgramExpr("a + b :: c", table)).toThrow(ProgramParseError);
    expect(() => parseProgramExpr("a :: b + c", table)).toThrow(ProgramParseError);
    // parentheses resolve the ambiguity explicitly
    expect(expressionEqual(
      parseProgramExpr("(a + b) :: c", table),
      ctor("cons", [call("add", [programVar("a"), programVar("b")]), programVar("c")]),
    )).toBe(true);
    expect(expressionEqual(
      parseProgramExpr("a + (b :: c)", table),
      call("add", [programVar("a"), ctor("cons", [programVar("b"), programVar("c")])]),
    )).toBe(true);
  });
});
