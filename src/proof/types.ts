/**
 * The proof language's TYPE layer — a small, structured type AST that
 * replaces the old string sniffing (`startsWith("List")`, `includes("→")`).
 *
 * The grammar is deliberately tiny and matches exactly what the lesson
 * contexts and program signatures use:
 *
 *   TypeExpr ::= Type                 -- the sort of types (displayed Prop too)
 *              | <name>               -- a named type (Nat, Bool) or a type
 *                                        variable (A, B, C) — distinguished at
 *                                        elaboration time against the datatype
 *                                        environment, never syntactically
 *              | <name> τ₁ … τₙ       -- type application (List A)
 *              | τ₁ → τ₂              -- a function arrow (right-associative)
 *
 * `Prop` is TouchProof's DISPLAY name for the predicative `Type 0`; the
 * parser accepts it and the elaborator treats it exactly like `Type`.
 *
 * Elaboration into kernel `Term`s lives here too: a named datatype becomes a
 * `const`, a type variable becomes a kernel `var`, application becomes a
 * curried kernel application, and an arrow becomes a (non-dependent) `Π`.
 * Unknown/unbound names and malformed syntax are REJECTED — a polymorphic
 * theorem can never silently collapse to a monomorphic instance.
 */

import { apps, arrow, constant, type, variable, type Term } from "../kernel/term.js";

export type TypeExpr =
  | { readonly kind: "sort" }
  | { readonly kind: "name"; readonly name: string; readonly args: readonly TypeExpr[] }
  | { readonly kind: "arrow"; readonly from: TypeExpr; readonly to: TypeExpr };

export class TypeParseError extends Error {}

/** The datatypes the elaborator recognises as kernel constants (everything else is a type variable). */
export const KNOWN_TYPE_NAMES: ReadonlySet<string> = new Set(["Nat", "Bool", "List"]);

const TYPE_TOKEN = /→|\(|\)|[A-Za-z_][A-Za-z0-9_]*/g;

/** Parses a source type string into a structured {@link TypeExpr}. */
export function parseTypeExpr(source: string): TypeExpr {
  const tokens = source.match(TYPE_TOKEN) ?? [];
  let position = 0;
  const peek = (): string | undefined => tokens[position];
  const take = (): string => {
    const token = tokens[position++];
    if (token === undefined) throw new TypeParseError("unexpected end of type");
    return token;
  };
  // An atom is a parenthesised type, or a name optionally applied to further
  // atoms (`List A`). Application binds tighter than the arrow.
  const atom = (): TypeExpr => {
    const token = take();
    if (token === "(") {
      const inner = arrowType();
      if (take() !== ")") throw new TypeParseError("expected )");
      return inner;
    }
    if (token === "→" || token === ")") throw new TypeParseError(`unexpected token ${token}`);
    if (token === "Type" || token === "Prop") return { kind: "sort" };
    const args: TypeExpr[] = [];
    while (peek() !== undefined && peek() !== "→" && peek() !== ")" && peek() !== "(") {
      args.push(applicationArgument());
    }
    // A parenthesised application argument (`List (A → B)`) is also allowed.
    while (peek() === "(") args.push(applicationArgument());
    return { kind: "name", name: token, args };
  };
  const applicationArgument = (): TypeExpr => {
    const token = peek();
    if (token === "(") {
      take();
      const inner = arrowType();
      if (take() !== ")") throw new TypeParseError("expected )");
      return inner;
    }
    const name = take();
    if (name === "→" || name === ")" || name === "(") throw new TypeParseError(`unexpected token ${name}`);
    if (name === "Type" || name === "Prop") return { kind: "sort" };
    return { kind: "name", name, args: [] };
  };
  const arrowType = (): TypeExpr => {
    const left = atom();
    if (peek() === "→") {
      take();
      return { kind: "arrow", from: left, to: arrowType() };
    }
    return left;
  };
  const result = arrowType();
  if (position !== tokens.length) throw new TypeParseError(`unexpected token ${tokens[position]}`);
  return result;
}

/** Prints a {@link TypeExpr} back to its canonical source spelling. */
export function typeExprToString(typeExpr: TypeExpr): string {
  switch (typeExpr.kind) {
    case "sort": return "Type";
    case "name": return typeExpr.args.length === 0
      ? typeExpr.name
      : `${typeExpr.name} ${typeExpr.args.map(printArgument).join(" ")}`;
    case "arrow": return `${printArrowLeft(typeExpr.from)} → ${typeExprToString(typeExpr.to)}`;
  }
}

function printArgument(typeExpr: TypeExpr): string {
  return typeExpr.kind === "name" && typeExpr.args.length === 0 || typeExpr.kind === "sort"
    ? typeExprToString(typeExpr)
    : `(${typeExprToString(typeExpr)})`;
}

function printArrowLeft(typeExpr: TypeExpr): string {
  return typeExpr.kind === "arrow" ? `(${typeExprToString(typeExpr)})` : typeExprToString(typeExpr);
}

/** The free (unbound) named atoms of a type that are NOT known datatypes — its type variables. */
export function typeVariables(typeExpr: TypeExpr, into: Set<string> = new Set<string>()): Set<string> {
  switch (typeExpr.kind) {
    case "sort": return into;
    case "name":
      if (!KNOWN_TYPE_NAMES.has(typeExpr.name)) into.add(typeExpr.name);
      for (const argument of typeExpr.args) typeVariables(argument, into);
      return into;
    case "arrow":
      typeVariables(typeExpr.from, into);
      typeVariables(typeExpr.to, into);
      return into;
  }
}

/**
 * Elaborates a source {@link TypeExpr} into a kernel {@link Term}, resolving
 * every named atom against `typeVars`: a name in `typeVars` becomes a kernel
 * variable, a known datatype becomes a constant applied to its (elaborated)
 * arguments, and anything else is REJECTED. Arrows become non-dependent Π.
 */
export function elaborateType(typeExpr: TypeExpr, typeVars: ReadonlySet<string>): Term {
  switch (typeExpr.kind) {
    case "sort": return type(0);
    case "name": {
      const args = typeExpr.args.map((argument) => elaborateType(argument, typeVars));
      if (typeVars.has(typeExpr.name)) {
        if (args.length > 0) throw new TypeParseError(`type variable ${typeExpr.name} cannot be applied`);
        return variable(typeExpr.name);
      }
      if (!KNOWN_TYPE_NAMES.has(typeExpr.name)) throw new TypeParseError(`unknown type ${typeExpr.name}`);
      return args.length === 0 ? constant(typeExpr.name) : apps(constant(typeExpr.name), ...args);
    }
    case "arrow":
      return arrow(elaborateType(typeExpr.from, typeVars), elaborateType(typeExpr.to, typeVars));
  }
}

/** Convenience: parse then elaborate. */
export function elaborateTypeSource(source: string, typeVars: ReadonlySet<string>): Term {
  return elaborateType(parseTypeExpr(source), typeVars);
}

/** The kernel-level ELEMENT-TYPE arguments a `List`-typed source term applies. For `List A` that is `[A]`. */
export function listElementType(typeExpr: TypeExpr): TypeExpr | undefined {
  return typeExpr.kind === "name" && typeExpr.name === "List" && typeExpr.args.length === 1
    ? typeExpr.args[0]
    : undefined;
}
