import { describe, expect, it } from "vitest";
import { inductiveDefinitions, inductiveToScript, programDefinitions } from "@touchproof/core";
import { cat, group, line, nest, render, text } from "../lib/doc";
import { clauseToScript, inductiveToScriptAt } from "../lib/programDoc";

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
});
