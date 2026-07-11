import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLessonSession, isPropositionGoal, parseProgramExpr } from "@touchproof/core";
import { PropositionCard } from "../components/EquationCard";
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

  it("renders propositional connectives with the table's minimal parens", () => {
    // infixr 4 AND binds tighter than infixr 3 IMP: the antecedent stays bare;
    expect(textOf("imp(and(P, Q), P)")).toBe("P \u2227\u00A0Q \u2192\u00A0P");
    // a nested implication on the left is wrapped, and the right side is not.
    expect(textOf("imp(imp(P, Q), P)")).toBe("(P \u2192\u00A0Q) \u2192\u00A0P");
    expect(textOf("imp(P, imp(Q, P))")).toBe("P \u2192\u00A0Q \u2192\u00A0P");
  });
});

describe("proposition hero card", () => {
  it("shows the goal proposition with no equals sign and a \u2713 close affordance", () => {
    const session = createLessonSession("prop-and-left");
    const goal = session.goals[0]!;
    if (!isPropositionGoal(goal)) throw new Error("prop-and-left should open on a proposition goal");
    const markup = renderToStaticMarkup(createElement(PropositionCard, {
      proposition: goal.proposition,
      moves: [],
      closeMove: undefined,
      busy: false,
      solved: false,
      onMove: () => undefined,
    }));
    const text = markup.replace(/<[^>]+>/g, "");
    expect(text).toBe("P \u2227\u00A0Q \u2192\u00A0P");
    expect(text).not.toContain("=");
    expect(markup).toContain("proposition-card");
    // The check is pure affordance: with no exact move it does not render at all.
    expect(markup).not.toContain("\u2713");
  });
});
