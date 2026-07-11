export type Expr =
  | { readonly id: string; readonly kind: "var"; readonly name: string }
  | { readonly id: string; readonly kind: "ctor"; readonly name: string; readonly args: readonly Expr[] }
  | { readonly id: string; readonly kind: "call"; readonly name: string; readonly args: readonly Expr[] };

let nextId = 0;
const freshId = (prefix: string): string => `${prefix}-${++nextId}`;

export const programVar = (name: string, nodeId = freshId(name)): Expr => ({ id: nodeId, kind: "var", name });
export const ctor = (name: string, args: readonly Expr[] = [], nodeId = freshId(name)): Expr => ({ id: nodeId, kind: "ctor", name, args });
export const call = (name: string, args: readonly Expr[], nodeId = freshId(name)): Expr => ({ id: nodeId, kind: "call", name, args });

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

export function exprToText(expr: Expr): string {
  if (expr.kind === "var") return expr.name;
  if (expr.kind === "ctor") {
    if (expr.name === "nil") return "[]";
    if (expr.name === "zero") return "0";
    if (expr.name === "succ" && expr.args.length === 1) return `S (${exprToText(expr.args[0]!)})`;
    if (expr.name === "cons" && expr.args.length === 2) return `${exprToText(expr.args[0]!)} :: ${exprToText(expr.args[1]!)}`;
    return expr.args.length === 0 ? expr.name : `${expr.name} ${expr.args.map(exprToText).join(" ")}`;
  }
  if (expr.name === "compose" && expr.args.length === 2) return `(${exprToText(expr.args[0]!)} ∘ ${exprToText(expr.args[1]!)})`;
  if (expr.name === "apply" && expr.args.length === 2) return `${exprToText(expr.args[0]!)} (${exprToText(expr.args[1]!)})`;
  if (expr.name === "map" && expr.args.length === 2) {
    const [fn, value] = expr.args;
    const text = exprToText(value!);
    return `map ${exprToText(fn!)} ${value!.kind === "var" || (value!.kind === "ctor" && value!.name === "nil") ? text : `(${text})`}`;
  }
  if ((expr.name === "negb" || expr.name === "rev") && expr.args.length === 1) {
    const value = expr.args[0]!;
    const text = exprToText(value);
    return `${expr.name} ${value.kind === "var" || (value.kind === "ctor" && value.name === "nil") ? text : `(${text})`}`;
  }
  if ((expr.name === "add" || expr.name === "append") && expr.args.length === 2) {
    return `${exprToText(expr.args[0]!)} ${expr.name === "add" ? "+" : "++"} ${exprToText(expr.args[1]!)}`;
  }
  return `${expr.name} ${expr.args.map((arg) => arg.kind === "call" ? `(${exprToText(arg)})` : exprToText(arg)).join(" ")}`;
}

export class ProgramParseError extends Error {}

const CONSTRUCTORS = new Set(["true", "false", "zero", "succ", "nil", "cons"]);

/** Parses the canonical script form: calls use `f(a, b)`; ++, +, :: and ∘ are accepted infix. */
export function parseProgramExpr(source: string): Expr {
  const tokens = source.match(/\[\]|\+\+|::|∘|[()+,]|[A-Za-z_][A-Za-z0-9_]*|0/g) ?? [];
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
  const precedence = (token: string | undefined): number => token === "∘" ? 40 : token === "::" ? 30 : token === "+" || token === "++" ? 20 : -1;
  const infix = (minimum: number): Expr => {
    let left = atom();
    while (precedence(peek()) >= minimum) {
      const operator = take();
      const right = infix(precedence(operator) + (operator === "::" ? 0 : 1));
      left = operator === "::" ? ctor("cons", [left, right])
        : operator === "++" ? call("append", [left, right])
          : operator === "+" ? call("add", [left, right])
            : call("compose", [left, right]);
    }
    return left;
  };
  const result = infix(0);
  if (position !== tokens.length) throw new ProgramParseError(`unexpected token ${tokens[position]}`);
  return result;
}
