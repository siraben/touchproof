import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseProgramExpr } from "@touchproof/core";
import { Expression } from "../components/Expression";

const markupOf = (source: string): string =>
  renderToStaticMarkup(createElement(Expression, {
    expression: parseProgramExpr(source),
    moves: [],
    onMove: () => undefined,
  }));

// Extracted text: operators carry a breakable space before and an NBSP after;
// juxtaposed application spacing is visual (.argument margin), not characters.
const textOf = (source: string): string => markupOf(source).replace(/<[^>]+>/g, "");

describe("interactive expression renderer", () => {
  it("renders nested infix operands with core's minimal parens (lesson 12 associativity)", () => {
    // infixl 6 `+`: the left child at equal precedence stays bare, the right child is wrapped.
    expect(textOf("add(add(a, b), c)")).toBe("a +\u00A0b +\u00A0c");
    expect(textOf("add(a, add(b, c))")).toBe("a +\u00A0(b +\u00A0c)");
  });

  it("parenthesizes append/cons with core's minimal parens", () => {
    // `::` and `++` share level 5 and associate right: a left `::` child is wrapped,
    // a right `++` child at equal precedence on the associative side is not.
    expect(textOf("append(cons(x, xs), ys)")).toBe("(x ::\u00A0xs) ++\u00A0ys");
    expect(textOf("cons(x, append(xs, ys))")).toBe("x ::\u00A0xs ++\u00A0ys");
  });

  it("leaves applications bare inside infix operands", () => {
    expect(textOf("add(succ(n), m)")).toBe("Sn +\u00A0m");
    expect(textOf("append(rev(xs), ys)")).toBe("revxs ++\u00A0ys");
  });

  it("parenthesizes application arguments only when compound", () => {
    expect(markupOf("apply(f, x)")).toContain("argument");
    expect(textOf("apply(f, x)")).toBe("fx");
    expect(textOf("apply(f, apply(g, x))")).toBe("f(gx)");
    expect(textOf("apply(compose(f, g), x)")).toBe("(f ∘\u00A0g)x");
    expect(textOf("rev(cons(x, xs))")).toBe("rev(x ::\u00A0xs)");
  });
});
