import { operatorByName, operatorBySymbol, operatorTable, type OperatorFixity } from "./fixity.js";

export type Expr =
  | { readonly id: string; readonly kind: "var"; readonly name: string }
  | { readonly id: string; readonly kind: "ctor"; readonly name: string; readonly args: readonly Expr[] }
  | { readonly id: string; readonly kind: "call"; readonly name: string; readonly args: readonly Expr[] };

let nextId = 0;
const freshId = (prefix: string): string => `${prefix}-${++nextId}`;

export const programVar = (name: string, nodeId: string = freshId(name)): Expr => ({ id: nodeId, kind: "var", name });
export const ctor = (name: string, args: readonly Expr[] = [], nodeId: string = freshId(name)): Expr => ({ id: nodeId, kind: "ctor", name, args });
export const call = (name: string, args: readonly Expr[], nodeId: string = freshId(name)): Expr => ({ id: nodeId, kind: "call", name, args });

export function cloneFresh(expr: Expr): Expr {
  if (expr.kind === "var") return programVar(expr.name);
  return expr.kind === "ctor"
    ? ctor(expr.name, expr.args.map(cloneFresh))
    : call(expr.name, expr.args.map(cloneFresh));
}

export function expressionEqual(left: Expr, right: Expr): boolean {
  if (left.kind !== right.kind || left.name !== right.name) return false;
  if (left.kind === "var" || right.kind === "var") return left.kind === "var" && right.kind === "var";
  return left.args.length === right.args.length
    && left.args.every((arg, index) => expressionEqual(arg, right.args[index]!));
}

export function replaceVariable(expr: Expr, name: string, replacement: Expr): Expr {
  if (expr.kind === "var") return expr.name === name ? cloneFresh(replacement) : expr;
  const args = expr.args.map((arg) => replaceVariable(arg, name, replacement));
  return { ...expr, args };
}

export function replaceById(expr: Expr, targetId: string, replacement: Expr): Expr {
  if (expr.id === targetId) return { ...cloneFresh(replacement), id: targetId };
  if (expr.kind === "var") return expr;
  return { ...expr, args: expr.args.map((arg) => replaceById(arg, targetId, replacement)) };
}

export function allExpressions(expr: Expr): Expr[] {
  return expr.kind === "var" ? [expr] : [expr, ...expr.args.flatMap(allExpressions)];
}

/** Precedence of an atom (a variable or a nullary head): binds tighter than everything. */
const ATOM_PRECEDENCE = 11;
/** Precedence of prefix application `f x y`: tighter than every infix operator. */
const APPLICATION_PRECEDENCE = 10;

/** Display spellings for nullary and prefix heads; purely cosmetic. */
function displayHead(name: string): string {
  if (name === "nil") return "[]";
  if (name === "zero") return "0";
  if (name === "succ") return "S";
  return name;
}

/**
 * Table-driven printing: an operator child is parenthesized exactly when its
 * precedence is below what its position requires — the operand on an
 * operator's associative side admits equal precedence, the other side
 * requires strictly higher. No operator is special-cased.
 */
function printExpr(expr: Expr, minimum: number): string {
  if (expr.kind === "var") return expr.name;
  const operator = expr.args.length === 2 ? operatorByName(expr.name) : undefined;
  if (operator !== undefined) {
    const { precedence, associativity, symbol, spacing } = operator;
    const left = printExpr(expr.args[0]!, associativity === "left" ? precedence : precedence + 1);
    const right = printExpr(expr.args[1]!, associativity === "right" ? precedence : precedence + 1);
    const text = `${left}${spacing}${symbol}${spacing}${right}`;
    return precedence < minimum ? `(${text})` : text;
  }
  if (expr.args.length === 0) return displayHead(expr.name);
  if (expr.kind === "call" && expr.name === "apply" && expr.args.length === 2) {
    // Object-level application of a first-class function value. The argument
    // is always parenthesized because juxtaposition is display-only syntax.
    const text = `${printExpr(expr.args[0]!, APPLICATION_PRECEDENCE)} (${printExpr(expr.args[1]!, 0)})`;
    return APPLICATION_PRECEDENCE < minimum ? `(${text})` : text;
  }
  const text = `${displayHead(expr.name)} ${expr.args.map((argument) => printExpr(argument, ATOM_PRECEDENCE)).join(" ")}`;
  return APPLICATION_PRECEDENCE < minimum ? `(${text})` : text;
}

export function exprToText(expr: Expr): string {
  return printExpr(expr, 0);
}

export class ProgramParseError extends Error {}

const CONSTRUCTORS = new Set(["true", "false", "zero", "succ", "nil", "cons"]);

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tokenPattern(table: readonly OperatorFixity[]): RegExp {
  const symbols = table.map((operator) => operator.symbol)
    .sort((first, second) => second.length - first.length)
    .map(escapeForRegExp);
  return new RegExp(["\\[\\]", ...symbols, "[(),]", "[A-Za-z_][A-Za-z0-9_]*", "0"].join("|"), "g");
}

/**
 * Parses the canonical script form: calls use `f(a, b)`; the infix operators
 * declared in the fixity table are accepted with their declared precedence
 * and associativity via precedence climbing. The algorithm consults ONLY the
 * table — no operator is special-cased. Chaining operators of equal
 * precedence but different associativity without parentheses is rejected
 * (Haskell's rule), never silently associated.
 */
export function parseProgramExpr(source: string, table: readonly OperatorFixity[] = operatorTable): Expr {
  const tokens = source.match(tokenPattern(table)) ?? [];
  let position = 0;
  const peek = (): string | undefined => tokens[position];
  const take = (): string => {
    const token = tokens[position++];
    if (token === undefined) throw new ProgramParseError("unexpected end of expression");
    return token;
  };
  const atom = (): Expr => {
    const token = take();
    if (token === "(") {
      const value = infix(0);
      if (take() !== ")") throw new ProgramParseError("expected )");
      return value;
    }
    if (token === "[]") return ctor("nil");
    if (token === "0") return ctor("zero");
    if (!/^[A-Za-z_]/.test(token)) throw new ProgramParseError(`unexpected token ${token}`);
    if (peek() === "(") {
      take();
      const args: Expr[] = [];
      if (peek() !== ")") {
        while (true) {
          args.push(infix(0));
          if (peek() !== ",") break;
          take();
        }
      }
      if (take() !== ")") throw new ProgramParseError("expected ) after arguments");
      return CONSTRUCTORS.has(token) ? ctor(token, args) : call(token, args);
    }
    return CONSTRUCTORS.has(token) ? ctor(token) : programVar(token);
  };
  const infix = (minimum: number, incoming?: OperatorFixity): Expr => {
    let left = atom();
    let previous = incoming;
    while (true) {
      const token = peek();
      const operator = token === undefined ? undefined : operatorBySymbol(token, table);
      if (operator === undefined || operator.precedence < minimum) break;
      if (previous !== undefined && previous.precedence === operator.precedence && previous.associativity !== operator.associativity) {
        throw new ProgramParseError(
          `cannot mix ${previous.symbol} and ${operator.symbol} at the same precedence; add parentheses`,
        );
      }
      take();
      const right = infix(operator.associativity === "left" ? operator.precedence + 1 : operator.precedence, operator);
      left = CONSTRUCTORS.has(operator.name) ? ctor(operator.name, [left, right]) : call(operator.name, [left, right]);
      previous = operator;
    }
    return left;
  };
  const result = infix(0);
  if (position !== tokens.length) throw new ProgramParseError(`unexpected token ${tokens[position]}`);
  return result;
}
