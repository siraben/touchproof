/**
 * Converters from the core program AST to pretty-printer documents, matching
 * the surface syntax of the hand-written `script` strings in the core
 * definitions (see src/proof/definitions.ts): infix `++`, `+`, `::` and `∘`,
 * juxtaposition application (`map f xs`), `[]`/`[x]` list sugar and `0`/`S n`
 * numerals. Groups break BEFORE an operator or after a clause's `=`, with a
 * two-space-indented continuation — the same discipline the Visual view uses.
 *
 * Every token is annotated with a highlighting tag; layout is unaffected
 * (plain `render` output is byte-identical to the untagged printer).
 */

import type { DefinitionClause, InductiveDefinition, ProgramExpr } from "@touchproof/core";
import { annotate, cat, group, hardline, line, nest, render, renderSegments, text, type Doc, type Segment } from "./doc";

/** Highlighting tags shared by the doc printer and the script tokenizer. */
export type TokenTag = "keyword" | "type" | "ctor" | "fn" | "operator" | "paren" | "number";

const tagged = (tag: TokenTag, value: string): Doc => annotate(tag, text(value));

/** How an expression binds, for parenthesization. */
export type ExpressionShape = "atom" | "application" | "binary";

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

/**
 * The single parenthesization authority, shared by this printer and the
 * interactive Expression renderer so the two surfaces can never disagree:
 * infix operands parenthesize nested infix expressions ("binary"), while
 * applications and atoms stand bare; application arguments parenthesize
 * everything but atoms. `listLiterals` says whether the caller renders cons
 * spines ending in nil as `[x]` sugar (this printer does; the DOM view keeps
 * `x :: []` so every node stays a tappable span, hence cons stays "binary").
 */
export function expressionShape(expr: ProgramExpr, options: { listLiterals: boolean }): ExpressionShape {
  if (expr.kind === "var") return "atom";
  if (expr.kind === "ctor") {
    if (options.listLiterals && listLiteral(expr) !== undefined) return "atom";
    if (expr.name === "zero" || expr.name === "nil") return "atom";
    if (expr.name === "cons") return "binary";
    return expr.args.length === 0 ? "atom" : "application";
  }
  if (expr.name in INFIX && expr.args.length === 2) return "binary";
  if (expr.name === "compose" && expr.args.length === 2) return "atom"; // self-parenthesized
  return "application";
}

const shapeOf = (expr: ProgramExpr): ExpressionShape => expressionShape(expr, { listLiterals: true });

const parenthesize = (doc: Doc): Doc => cat(tagged("paren", "("), doc, tagged("paren", ")"));

/** An argument of a juxtaposed application: everything but atoms is wrapped. */
function argumentToDoc(expr: ProgramExpr): Doc {
  return shapeOf(expr) === "atom" ? exprToDoc(expr) : parenthesize(exprToDoc(expr));
}

/** An operand of an infix operator: nested infix operators are wrapped. */
function operandToDoc(expr: ProgramExpr): Doc {
  return shapeOf(expr) === "binary" ? parenthesize(exprToDoc(expr)) : exprToDoc(expr);
}

/** Break-before-operator layout: `lhs ++ rhs` or `lhs\n  ++ rhs`. */
function infixToDoc(operator: string, tag: TokenTag, left: ProgramExpr, right: ProgramExpr): Doc {
  return group(cat(operandToDoc(left), nest(2, cat(line, tagged(tag, `${operator} `), operandToDoc(right)))));
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
      if (literal.length === 0) return tagged("ctor", "[]");
      return cat(tagged("ctor", "["), ...literal.flatMap((item, index) => index === 0 ? [exprToDoc(item)] : [tagged("paren", ", "), exprToDoc(item)]), tagged("ctor", "]"));
    }
    if (expr.name === "zero") return tagged("ctor", "0");
    if (expr.name === "succ" && expr.args.length === 1) return applicationToDoc(tagged("ctor", "S"), expr.args);
    if (expr.name === "cons" && expr.args.length === 2) return infixToDoc("::", "ctor", expr.args[0]!, expr.args[1]!);
    return expr.args.length === 0 ? tagged("ctor", expr.name) : applicationToDoc(tagged("ctor", expr.name), expr.args);
  }
  const operator = INFIX[expr.name];
  if (operator !== undefined && expr.args.length === 2) return infixToDoc(operator, "operator", expr.args[0]!, expr.args[1]!);
  if (expr.name === "compose" && expr.args.length === 2) {
    return parenthesize(cat(operandToDoc(expr.args[0]!), tagged("operator", " ∘ "), operandToDoc(expr.args[1]!)));
  }
  if (expr.name === "apply" && expr.args.length === 2) {
    const fn = expr.args[0]!;
    const head = shapeOf(fn) === "binary" ? parenthesize(exprToDoc(fn)) : exprToDoc(fn);
    return applicationToDoc(head, [expr.args[1]!]);
  }
  return applicationToDoc(tagged("fn", expr.name), expr.args);
}

/** `lhs = rhs` on one line, or `lhs =` with a two-space-indented rhs below. */
export function clauseToDoc(definitionName: string, clause: DefinitionClause): Doc {
  const lhs: ProgramExpr = { id: `${definitionName}-clause-lhs`, kind: "call", name: definitionName, args: clause.patterns };
  return group(cat(exprToDoc(lhs), tagged("operator", " ="), nest(2, cat(line, exprToDoc(clause.result)))));
}

export function clauseToScript(definitionName: string, clause: DefinitionClause, maxWidth: number): string {
  return render(clauseToDoc(definitionName, clause), maxWidth);
}

export function clauseToSegments(definitionName: string, clause: DefinitionClause, maxWidth: number): Segment[] {
  return renderSegments(clauseToDoc(definitionName, clause), maxWidth);
}

/** `A : Type` parameter and `x : List A` field entries, highlighted. */
function bindingToDoc(binding: { name: string; type: string }): Doc {
  return cat(text(binding.name), tagged("operator", " : "), tagged("type", binding.type));
}

/** The `data … where | ctor …` block, one hard line per constructor. */
export function inductiveToDoc(definition: InductiveDefinition): Doc {
  const parameters = definition.parameters.map((parameter) => {
    const [name = parameter, type] = parameter.split(" : ");
    return type === undefined ? text(parameter) : bindingToDoc({ name, type });
  });
  return cat(
    tagged("keyword", "data"),
    tagged("type", ` ${definition.name}`),
    ...(parameters.length === 0 ? [] : [text(" "), tagged("paren", "("), ...parameters.flatMap((parameter, index) => index === 0 ? [parameter] : [tagged("paren", ", "), parameter]), tagged("paren", ")")]),
    tagged("keyword", " where"),
    nest(2, cat(...definition.constructors.map((constructor) => cat(
      hardline,
      tagged("operator", "| "),
      tagged("ctor", constructor.name),
      ...(constructor.fields.length === 0 ? [] : [
        text(" "),
        tagged("paren", "("),
        ...constructor.fields.flatMap((field, index) => index === 0 ? [bindingToDoc(field)] : [tagged("paren", ", "), bindingToDoc(field)]),
        tagged("paren", ")"),
      ]),
    )))),
  );
}

export function inductiveToScriptAt(definition: InductiveDefinition, maxWidth: number): string {
  return render(inductiveToDoc(definition), maxWidth);
}

export function inductiveToSegments(definition: InductiveDefinition, maxWidth: number): Segment[] {
  return renderSegments(inductiveToDoc(definition), maxWidth);
}
