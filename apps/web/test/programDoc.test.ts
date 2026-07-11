import { describe, expect, it } from "vitest";
import { inductiveDefinitions, inductiveToScript, parseProgramExpr, programDefinitions } from "@touchproof/core";
import { annotate, cat, group, line, nest, render, renderSegments, text } from "../lib/doc";
import { clauseToScript, clauseToSegments, exprToDoc, expressionShape, inductiveToScriptAt } from "../lib/programDoc";
import { tokenizeScript } from "../lib/scriptTokens";

describe("doc combinators", () => {
  const document = group(cat(text("lhs ="), nest(2, cat(line, text("a really long right hand side")))));

  it("renders flat when the group fits the width", () => {
    expect(render(document, 80)).toBe("lhs = a really long right hand side");
  });

  it("breaks with nested indentation when the group does not fit", () => {
    expect(render(document, 20)).toBe("lhs =\n  a really long right hand side");
  });

  it("re-checks nested groups against the remaining width", () => {
    const inner = group(cat(text("inner"), line, text("group")));
    const outer = group(cat(text("head ="), nest(2, cat(line, inner))));
    expect(render(outer, 13)).toBe("head =\n  inner group");
    expect(render(outer, 8)).toBe("head =\n  inner\n  group");
  });
});

describe("program documents", () => {
  it("round-trips every definition clause at width 80", () => {
    for (const definition of programDefinitions) {
      for (const clause of definition.clauses) {
        expect(clauseToScript(definition.name, clause, 80)).toBe(clause.script);
      }
    }
  });

  it("round-trips every inductive block at width 80", () => {
    for (const definition of inductiveDefinitions) {
      expect(inductiveToScriptAt(definition, 80)).toBe(inductiveToScript(definition));
    }
  });

  it("breaks the revAcc cons clause tree-style after = at card width", () => {
    const definition = programDefinitions.find((item) => item.name === "revAcc")!;
    const cons = definition.clauses.find((clause) => clause.label === "cons")!;
    expect(clauseToScript(definition.name, cons, 36)).toBe("revAcc (x :: xs) acc =\n  revAcc xs (x :: acc)");
  });

  it("parenthesizes nested infix operands (the lesson-12 associativity shape)", () => {
    expect(render(exprToDoc(parseProgramExpr("add(add(a, b), c)")), 80)).toBe("(a + b) + c");
    expect(render(exprToDoc(parseProgramExpr("add(a, add(b, c))")), 80)).toBe("a + (b + c)");
    // The DOM renderer derives its parens from the same shape classification.
    expect(expressionShape(parseProgramExpr("add(a, b)"), { listLiterals: false })).toBe("binary");
    expect(expressionShape(parseProgramExpr("cons(x, nil)"), { listLiterals: false })).toBe("binary");
    expect(expressionShape(parseProgramExpr("cons(x, nil)"), { listLiterals: true })).toBe("atom");
    expect(expressionShape(parseProgramExpr("rev(xs)"), { listLiterals: false })).toBe("application");
  });
});

describe("annotated rendering", () => {
  it("keeps layout unchanged and reports the innermost tag", () => {
    const doc = group(cat(annotate("fn", text("rev")), nest(2, cat(line, annotate("outer", cat(text("a"), annotate("ctor", text("[]"))))))));
    expect(renderSegments(doc, 80)).toEqual([
      { text: "rev", tag: "fn" },
      { text: " " },
      { text: "a", tag: "outer" },
      { text: "[]", tag: "ctor" },
    ]);
    expect(render(doc, 80)).toBe("rev a[]");
  });

  it("concatenates every clause's segments to its plain rendering", () => {
    for (const definition of programDefinitions) {
      for (const clause of definition.clauses) {
        const segments = clauseToSegments(definition.name, clause, 36);
        expect(segments.map((segment) => segment.text).join("")).toBe(clauseToScript(definition.name, clause, 36));
      }
    }
  });

  it("tags a clause's tokens for highlighting", () => {
    const rev = programDefinitions.find((item) => item.name === "rev")!;
    const cons = rev.clauses.find((clause) => clause.label === "cons")!;
    const segments = clauseToSegments(rev.name, cons, 80);
    expect(segments.find((segment) => segment.text === "rev")?.tag).toBe("fn");
    expect(segments.some((segment) => segment.tag === "operator")).toBe(true);
  });

  it("tokenizes proof scripts losslessly", () => {
    const script = "(λ n : Nat, refl (add n 0))\n: (Π n : Nat, ((add n 0) = n))";
    const tokens = tokenizeScript(script);
    expect(tokens.map((token) => token.text).join("")).toBe(script);
    expect(tokens.find((token) => token.text.includes("λ"))?.tag).toBe("keyword");
    expect(tokens.find((token) => token.text.includes("Nat"))?.tag).toBe("type");
  });
});
