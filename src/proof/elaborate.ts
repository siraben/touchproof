/**
 * Typed elaboration from the visual proof language's program `Expr`s into
 * kernel `Term`s. The kernel is EXPLICITLY typed and performs no inference,
 * so a polymorphic constant such as `map`, `nil`, or `cons` must be applied
 * to its element type(s) here. This module reconstructs those type arguments
 * by a small bidirectional inference over the program tree, using the goal's
 * variable context, and rejects anything it cannot type.
 *
 * The source type layer is {@link TypeExpr}; the datatype element types are
 * always parsed once at the context boundary into structured data.
 */

import { app, apps, constant, variable, type Term } from "../kernel/term.js";
import type { Expr } from "./ast.js";
import {
  elaborateType,
  listElementType,
  parseTypeExpr,
  type TypeExpr,
} from "./types.js";

export class ElaborationError extends Error {}

const nat: TypeExpr = { kind: "name", name: "Nat", args: [] };
const bool: TypeExpr = { kind: "name", name: "Bool", args: [] };
const listOf = (element: TypeExpr): TypeExpr => ({ kind: "name", name: "List", args: [element] });

/** A program head's fixed source result type, when it does not depend on the arguments' element types. */
function constantResultType(name: string): TypeExpr | undefined {
  switch (name) {
    case "true":
    case "false":
    case "negb": return bool;
    case "zero":
    case "succ":
    case "add":
    case "length": return nat;
    default: return undefined;
  }
}

/** The variable→type map a goal context induces (type-variable binders excluded). */
export function contextTypes(entries: readonly string[]): Map<string, TypeExpr> {
  const result = new Map<string, TypeExpr>();
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator < 1) throw new ElaborationError(`invalid context binding ${entry}`);
    const sourceType = entry.slice(separator + 1).trim();
    if (sourceType === "Type" || sourceType === "Prop") continue;
    const parsed = parseTypeExpr(sourceType);
    for (const name of entry.slice(0, separator).split(",")) result.set(name.trim(), parsed);
  }
  return result;
}

/** The type variables declared in a goal context (`A, B : Type`). */
export function contextTypeVariables(entries: readonly string[]): Set<string> {
  const result = new Set<string>();
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator < 1) continue;
    const sourceType = entry.slice(separator + 1).trim();
    if (sourceType !== "Type" && sourceType !== "Prop") continue;
    for (const name of entry.slice(0, separator).split(",")) result.add(name.trim());
  }
  return result;
}

interface Typed {
  readonly term: Term;
  readonly type: TypeExpr;
}

export interface ExpressionElaborator {
  /** Elaborate an expression to a kernel term, optionally with an expected source type (for inferring bare `nil`). */
  readonly term: (expr: Expr, expected?: TypeExpr) => Term;
  /** The source type of an expression (its kernel form is `elaborate(type)`). */
  readonly typeOf: (expr: Expr) => TypeExpr;
  /** Elaborate a source type to a kernel term in this elaborator's type-variable scope. */
  readonly kernelType: (typeExpr: TypeExpr) => Term;
  /** The kernel element type when the expression has a `List _` type, else undefined. */
  readonly listElementOf: (expr: Expr) => Term | undefined;
}

/**
 * Builds an elaborator for a goal: `varTypes` types the program variables,
 * `typeVars` are the datatype type variables in scope (so `List A` elaborates
 * to `List A`, not a rejected unknown). `holeId`/`holeTerm` splice a kernel
 * term (a typed rewrite hole) at one expression id.
 */
export function expressionElaborator(
  varTypes: ReadonlyMap<string, TypeExpr>,
  typeVars: ReadonlySet<string>,
  splice?: { readonly id: string; readonly term: Term; readonly type: TypeExpr },
  ambientElement?: TypeExpr,
): ExpressionElaborator {
  const kernelType = (typeExpr: TypeExpr): Term => elaborateType(typeExpr, typeVars);
  // When a bare `nil` cannot be typed from context (e.g. `length []`, where a
  // list variable was replaced by the nil constructor during a case split so
  // no list variable remains in scope), fall back first to the unique element
  // type of the list variables in scope, then to the lesson-wide ambient
  // element (the induction variable's element). If neither is available `nil`
  // is (correctly) rejected as genuinely ambiguous.
  const defaultElement = uniqueListElement(varTypes) ?? ambientElement;

  const infer = (expr: Expr, expected?: TypeExpr): Typed => {
    if (splice !== undefined && expr.id === splice.id) return { term: splice.term, type: splice.type };
    if (expr.kind === "var") {
      const type = varTypes.get(expr.name);
      if (type === undefined) throw new ElaborationError(`untyped program variable ${expr.name}`);
      return { term: variable(expr.name), type };
    }
    return inferHead(expr, expected);
  };

  const inferHead = (expr: Expr & { readonly args: readonly Expr[] }, expected?: TypeExpr): Typed => {
    const { name, args } = expr;
    switch (name) {
      // Bool.
      case "true":
      case "false": return { term: constant(name), type: bool };
      case "negb": {
        const b = infer(args[0]!);
        return { term: app(constant("negb"), b.term), type: bool };
      }
      // Nat.
      case "zero": return { term: constant("zero"), type: nat };
      case "succ": return { term: app(constant("succ"), infer(args[0]!).term), type: nat };
      case "add": {
        const left = infer(args[0]!);
        const right = infer(args[1]!);
        return { term: apps(constant("add"), left.term, right.term), type: nat };
      }
      // List constructors: element type is explicit.
      case "nil": {
        const element = (expected !== undefined ? listElementType(expected) : undefined) ?? defaultElement;
        if (element === undefined) throw new ElaborationError("cannot infer the element type of nil");
        return { term: app(constant("nil"), kernelType(element)), type: listOf(element) };
      }
      case "cons": {
        const head = infer(args[0]!);
        const element = head.type;
        const tail = infer(args[1]!, listOf(element));
        return { term: apps(constant("cons"), kernelType(element), head.term, tail.term), type: listOf(element) };
      }
      // List functions.
      case "append": {
        const left = infer(args[0]!, expected);
        const element = requireListElement(left.type, "append");
        const right = infer(args[1]!, listOf(element));
        return { term: apps(constant("append"), kernelType(element), left.term, right.term), type: listOf(element) };
      }
      case "rev": {
        const xs = infer(args[0]!, expected);
        const element = requireListElement(xs.type, "rev");
        return { term: apps(constant("rev"), kernelType(element), xs.term), type: listOf(element) };
      }
      case "revAcc": {
        const xs = infer(args[0]!, expected);
        const element = requireListElement(xs.type, "revAcc");
        const acc = infer(args[1]!, listOf(element));
        return { term: apps(constant("revAcc"), kernelType(element), xs.term, acc.term), type: listOf(element) };
      }
      case "length": {
        const xs = infer(args[0]!);
        const element = requireListElement(xs.type, "length");
        return { term: apps(constant("length"), kernelType(element), xs.term), type: nat };
      }
      case "map": {
        const fn = infer(args[0]!);
        const [from, to] = requireArrow(fn.type, "map");
        const xs = infer(args[1]!, listOf(from));
        return { term: apps(constant("map"), kernelType(from), kernelType(to), fn.term, xs.term), type: listOf(to) };
      }
      // First-class function values.
      case "compose": {
        // compose : (B → C) → (A → B) → A → C; a VALUE of type A → C.
        const f = infer(args[0]!);
        const g = infer(args[1]!);
        const [b1, cType] = requireArrow(f.type, "compose");
        const [aType, b2] = requireArrow(g.type, "compose");
        if (!sameType(b1, b2)) throw new ElaborationError("compose middle types do not agree");
        return {
          term: apps(constant("compose"), kernelType(aType), kernelType(b1), kernelType(cType), f.term, g.term),
          type: { kind: "arrow", from: aType, to: cType },
        };
      }
      case "apply": {
        const fn = infer(args[0]!);
        const [, to] = requireArrow(fn.type, "apply");
        const argument = infer(args[1]!);
        return { term: app(fn.term, argument.term), type: to };
      }
      default: {
        const type = constantResultType(name);
        if (type === undefined) throw new ElaborationError(`cannot elaborate program head ${name}`);
        return { term: apps(constant(name), ...args.map((argument) => infer(argument).term)), type };
      }
    }
  };

  return {
    term: (expr, expected) => infer(expr, expected).term,
    typeOf: (expr) => infer(expr).type,
    kernelType,
    listElementOf: (expr) => {
      const element = listElementType(infer(expr).type);
      return element === undefined ? undefined : kernelType(element);
    },
  };
}

/** The single element type shared by every `List _` variable in scope, if they all agree; else undefined. */
function uniqueListElement(varTypes: ReadonlyMap<string, TypeExpr>): TypeExpr | undefined {
  let unique: TypeExpr | undefined;
  for (const type of varTypes.values()) {
    const element = listElementType(type);
    if (element === undefined) continue;
    if (unique === undefined) unique = element;
    else if (!sameType(unique, element)) return undefined;
  }
  return unique;
}

function requireListElement(typeExpr: TypeExpr, head: string): TypeExpr {
  const element = listElementType(typeExpr);
  if (element === undefined) throw new ElaborationError(`${head} expects a List argument`);
  return element;
}

function requireArrow(typeExpr: TypeExpr, head: string): readonly [TypeExpr, TypeExpr] {
  if (typeExpr.kind !== "arrow") throw new ElaborationError(`${head} expects a function argument`);
  return [typeExpr.from, typeExpr.to];
}

function sameType(left: TypeExpr, right: TypeExpr): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "sort") return true;
  if (left.kind === "name" && right.kind === "name") {
    return left.name === right.name && left.args.length === right.args.length
      && left.args.every((argument, index) => sameType(argument, right.args[index]!));
  }
  if (left.kind === "arrow" && right.kind === "arrow") {
    return sameType(left.from, right.from) && sameType(left.to, right.to);
  }
  return false;
}
