/**
 * Converters from the core program AST to pretty-printer documents, matching
 * the surface syntax of the hand-written `script` strings in the core
 * definitions (see src/proof/definitions.ts): infix `++`, `+`, `::` and `∘`,
 * juxtaposition application (`map f xs`), `[]`/`[x]` list sugar and `0`/`S n`
 * numerals. Groups break BEFORE an operator or after a clause's `=`, with a
 * two-space-indented continuation — the same discipline the Visual view uses.
 */

import type { DefinitionClause, InductiveDefinition, ProgramExpr } from "@touchproof/core";
import { cat, group, hardline, line, nest, render, text, type Doc } from "./doc";

/** How an expression binds, for parenthesization. */
type Shape = "atom" | "application" | "binary";

const INFIX: Readonly<Record<string, string>> = { add: "+", append: "++" };

/** The elements of a cons spine ending in nil, or undefined for open spines. */
function listLiteral(expr: ProgramExpr): ProgramExpr[] | undefined {
  if (expr.kind === "ctor" && expr.name === "nil") return [];
  if (expr.kind === "ctor" && expr.name === "cons" && expr.args.length === 2) {
    const tail = listLiteral(expr.args[1]!);
    return tail === undefined ? undefined : [expr.args[0]!, ...tail];
  }
  return undefined;
}

function shapeOf(expr: ProgramExpr): Shape {
  if (expr.kind === "var") return "atom";
  if (expr.kind === "ctor") {
    if (listLiteral(expr) !== undefined || expr.name === "zero") return "atom";
    if (expr.name === "cons") return "binary";
    return expr.args.length === 0 ? "atom" : "application";
  }
  if (expr.name in INFIX && expr.args.length === 2) return "binary";
  if (expr.name === "compose" && expr.args.length === 2) return "atom"; // self-parenthesized
  return "application";
}

const parenthesize = (doc: Doc): Doc => cat(text("("), doc, text(")"));

/** An argument of a juxtaposed application: everything but atoms is wrapped. */
function argumentToDoc(expr: ProgramExpr): Doc {
  return shapeOf(expr) === "atom" ? exprToDoc(expr) : parenthesize(exprToDoc(expr));
}

/** An operand of an infix operator: nested infix operators are wrapped. */
function operandToDoc(expr: ProgramExpr): Doc {
  return shapeOf(expr) === "binary" ? parenthesize(exprToDoc(expr)) : exprToDoc(expr);
}

/** Break-before-operator layout: `lhs ++ rhs` or `lhs\n  ++ rhs`. */
function infixToDoc(operator: string, left: ProgramExpr, right: ProgramExpr): Doc {
  return group(cat(operandToDoc(left), nest(2, cat(line, text(`${operator} `), operandToDoc(right)))));
}

/** Juxtaposed application: `head a b`, with each argument glued to the line. */
function applicationToDoc(head: Doc, args: readonly ProgramExpr[]): Doc {
  return cat(head, ...args.map((arg) => cat(text(" "), argumentToDoc(arg))));
}

export function exprToDoc(expr: ProgramExpr): Doc {
  if (expr.kind === "var") return text(expr.name);
  if (expr.kind === "ctor") {
    const literal = listLiteral(expr);
    if (literal !== undefined) {
      if (literal.length === 0) return text("[]");
      return cat(text("["), ...literal.flatMap((item, index) => index === 0 ? [exprToDoc(item)] : [text(", "), exprToDoc(item)]), text("]"));
    }
    if (expr.name === "zero") return text("0");
    if (expr.name === "succ" && expr.args.length === 1) return applicationToDoc(text("S"), expr.args);
    if (expr.name === "cons" && expr.args.length === 2) return infixToDoc("::", expr.args[0]!, expr.args[1]!);
    return expr.args.length === 0 ? text(expr.name) : applicationToDoc(text(expr.name), expr.args);
  }
  const operator = INFIX[expr.name];
  if (operator !== undefined && expr.args.length === 2) return infixToDoc(operator, expr.args[0]!, expr.args[1]!);
  if (expr.name === "compose" && expr.args.length === 2) {
    return parenthesize(cat(operandToDoc(expr.args[0]!), text(" ∘ "), operandToDoc(expr.args[1]!)));
  }
  if (expr.name === "apply" && expr.args.length === 2) {
    const fn = expr.args[0]!;
    const head = shapeOf(fn) === "binary" ? parenthesize(exprToDoc(fn)) : exprToDoc(fn);
    return applicationToDoc(head, [expr.args[1]!]);
  }
  return applicationToDoc(text(expr.name), expr.args);
}

/** `lhs = rhs` on one line, or `lhs =` with a two-space-indented rhs below. */
export function clauseToDoc(definitionName: string, clause: DefinitionClause): Doc {
  const lhs: ProgramExpr = { id: `${definitionName}-clause-lhs`, kind: "call", name: definitionName, args: clause.patterns };
  return group(cat(exprToDoc(lhs), text(" ="), nest(2, cat(line, exprToDoc(clause.result)))));
}

export function clauseToScript(definitionName: string, clause: DefinitionClause, maxWidth: number): string {
  return render(clauseToDoc(definitionName, clause), maxWidth);
}

/** The `data … where | ctor …` block, one hard line per constructor. */
export function inductiveToDoc(definition: InductiveDefinition): Doc {
  const parameters = definition.parameters.length === 0 ? "" : ` (${definition.parameters.join(", ")})`;
  return cat(
    text(`data ${definition.name}${parameters} where`),
    nest(2, cat(...definition.constructors.map((constructor) => {
      const fields = constructor.fields.length === 0
        ? ""
        : ` (${constructor.fields.map((field) => `${field.name} : ${field.type}`).join(", ")})`;
      return cat(hardline, text(`| ${constructor.name}${fields}`));
    }))),
  );
}

export function inductiveToScriptAt(definition: InductiveDefinition, maxWidth: number): string {
  return render(inductiveToDoc(definition), maxWidth);
}
