import {
  app,
  equal,
  pi,
  substitute,
  type Term,
  termToString,
} from "./term.js";

export interface Declaration {
  readonly type: Term;
  readonly value?: Term;
}

export type Environment = ReadonlyMap<string, Declaration>;
export type Context = ReadonlyMap<string, Term>;

export class KernelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KernelError";
  }
}

export function normalize(term: Term, environment: Environment): Term {
  switch (term.kind) {
    case "type":
    case "var":
      return term;
    case "const": {
      const value = environment.get(term.name)?.value;
      return value === undefined ? term : normalize(value, environment);
    }
    case "pi":
      return pi(term.param, normalize(term.domain, environment), normalize(term.codomain, environment));
    case "lam":
      return { ...term, paramType: normalize(term.paramType, environment), body: normalize(term.body, environment) };
    case "app": {
      const fn = normalize(term.fn, environment);
      const arg = normalize(term.arg, environment);
      return fn.kind === "lam"
        ? normalize(substitute(fn.body, fn.param, arg), environment)
        : app(fn, arg);
    }
    case "eq":
      return equal(
        normalize(term.type, environment),
        normalize(term.left, environment),
        normalize(term.right, environment),
      );
    case "refl":
      return { kind: "refl", value: normalize(term.value, environment) };
    case "subst": {
      const proof = normalize(term.proof, environment);
      return proof.kind === "refl"
        ? normalize(term.value, environment)
        : {
            kind: "subst",
            proof,
            motive: normalize(term.motive, environment),
            value: normalize(term.value, environment),
          };
    }
  }
}

function alphaEqual(left: Term, right: Term, renaming = new Map<string, string>()): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "type": return right.kind === "type" && left.level === right.level;
    case "const": return right.kind === "const" && left.name === right.name;
    case "var":
      return right.kind === "var" && (renaming.get(left.name) ?? left.name) === right.name;
    case "app":
      return right.kind === "app" && alphaEqual(left.fn, right.fn, renaming) && alphaEqual(left.arg, right.arg, renaming);
    case "eq":
      return right.kind === "eq" && alphaEqual(left.type, right.type, renaming)
        && alphaEqual(left.left, right.left, renaming) && alphaEqual(left.right, right.right, renaming);
    case "refl": return right.kind === "refl" && alphaEqual(left.value, right.value, renaming);
    case "subst":
      return right.kind === "subst" && alphaEqual(left.proof, right.proof, renaming)
        && alphaEqual(left.motive, right.motive, renaming) && alphaEqual(left.value, right.value, renaming);
    case "pi":
    case "lam": {
      if (right.kind !== left.kind) return false;
      const leftType = left.kind === "pi" ? left.domain : left.paramType;
      const rightType = right.kind === "pi" ? right.domain : right.paramType;
      if (!alphaEqual(leftType, rightType, renaming)) return false;
      const next = new Map(renaming);
      next.set(left.param, right.param);
      return alphaEqual(
        left.kind === "pi" ? left.codomain : left.body,
        right.kind === "pi" ? right.codomain : right.body,
        next,
      );
    }
  }
}

export function definitionallyEqual(left: Term, right: Term, environment: Environment): boolean {
  return alphaEqual(normalize(left, environment), normalize(right, environment));
}

function universeOf(term: Term, context: Context, environment: Environment): number {
  const inferred = normalize(infer(term, context, environment), environment);
  if (inferred.kind !== "type") {
    throw new KernelError(`expected a type, got ${termToString(inferred)}`);
  }
  return inferred.level;
}

export function infer(term: Term, context: Context, environment: Environment): Term {
  switch (term.kind) {
    case "type": return { kind: "type", level: term.level + 1 };
    case "var": {
      const found = context.get(term.name);
      if (found === undefined) throw new KernelError(`unbound variable ${term.name}`);
      return found;
    }
    case "const": {
      const found = environment.get(term.name);
      if (found === undefined) throw new KernelError(`unknown constant ${term.name}`);
      return found.type;
    }
    case "pi": {
      const domainLevel = universeOf(term.domain, context, environment);
      const inner = new Map(context);
      inner.set(term.param, term.domain);
      const codomainLevel = universeOf(term.codomain, inner, environment);
      return { kind: "type", level: Math.max(domainLevel, codomainLevel) };
    }
    case "lam": {
      universeOf(term.paramType, context, environment);
      const inner = new Map(context);
      inner.set(term.param, term.paramType);
      return pi(term.param, term.paramType, infer(term.body, inner, environment));
    }
    case "app": {
      const fnType = normalize(infer(term.fn, context, environment), environment);
      if (fnType.kind !== "pi") {
        throw new KernelError(`cannot apply a term of type ${termToString(fnType)}`);
      }
      check(term.arg, fnType.domain, context, environment);
      return substitute(fnType.codomain, fnType.param, term.arg);
    }
    case "eq":
      universeOf(term.type, context, environment);
      check(term.left, term.type, context, environment);
      check(term.right, term.type, context, environment);
      return { kind: "type", level: 0 };
    case "refl": {
      const valueType = infer(term.value, context, environment);
      return equal(valueType, term.value, term.value);
    }
    case "subst": {
      const proofType = normalize(infer(term.proof, context, environment), environment);
      if (proofType.kind !== "eq") throw new KernelError("subst requires an equality proof");
      const motiveType = normalize(infer(term.motive, context, environment), environment);
      if (motiveType.kind !== "pi" || !definitionallyEqual(motiveType.domain, proofType.type, environment)) {
        throw new KernelError("subst motive has the wrong domain");
      }
      universeOf(motiveType.codomain, new Map(context).set(motiveType.param, proofType.type), environment);
      check(term.value, app(term.motive, proofType.left), context, environment);
      return app(term.motive, proofType.right);
    }
  }
}

export function check(term: Term, expected: Term, context: Context, environment: Environment): void {
  if (term.kind === "lam") {
    const normalizedExpected = normalize(expected, environment);
    if (normalizedExpected.kind === "pi") {
      if (!definitionallyEqual(term.paramType, normalizedExpected.domain, environment)) {
        throw new KernelError("lambda parameter annotation does not match the expected domain");
      }
      const inner = new Map(context);
      inner.set(term.param, normalizedExpected.domain);
      const bodyExpected = substitute(normalizedExpected.codomain, normalizedExpected.param, { kind: "var", name: term.param });
      check(term.body, bodyExpected, inner, environment);
      return;
    }
  }
  const actual = infer(term, context, environment);
  if (actual.kind === "type" && expected.kind === "type" && actual.level <= expected.level) return;
  if (!definitionallyEqual(actual, expected, environment)) {
    throw new KernelError(`type mismatch: expected ${termToString(expected)}, got ${termToString(actual)}`);
  }
}

export function checkDeclaration(
  name: string,
  declaration: Declaration,
  environment: Environment,
): Environment {
  universeOf(declaration.type, new Map(), environment);
  if (declaration.value !== undefined) check(declaration.value, declaration.type, new Map(), environment);
  const next = new Map(environment);
  next.set(name, declaration);
  return next;
}
