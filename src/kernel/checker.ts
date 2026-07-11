import {
  app,
  apps,
  constant,
  equal,
  pi,
  recursor,
  substitute,
  variable,
  type Term,
  termToString,
} from "./term.js";

export interface Declaration {
  readonly type: Term;
  readonly value?: Term;
  readonly inductive?: InductiveDeclaration;
  readonly constructorInfo?: {
    readonly inductive: string;
    readonly index: number;
  };
}

export interface ConstructorField {
  readonly name: string;
  readonly type: Term;
  readonly recursive: boolean;
}

export interface InductiveConstructor {
  readonly name: string;
  readonly fields: readonly ConstructorField[];
}

export interface InductiveDeclaration {
  readonly name: string;
  readonly level: number;
  readonly constructors: readonly InductiveConstructor[];
}

export interface ConstructorInput {
  readonly name: string;
  readonly fields: readonly Readonly<{ readonly name: string; readonly type: Term }>[];
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
    case "recursor": {
      const target = normalize(term.target, environment);
      const application = unfoldApplication(target);
      if (application.head.kind === "const") {
        const constructor = environment.get(application.head.name)?.constructorInfo;
        if (constructor?.inductive === term.inductive) {
          const inductive = environment.get(term.inductive)?.inductive;
          const shape = inductive?.constructors[constructor.index];
          const branch = term.cases[constructor.index];
          if (shape !== undefined && branch !== undefined && application.args.length === shape.fields.length) {
            const recursiveResults = shape.fields.flatMap((field, index) => field.recursive
              ? [recursor(term.inductive, term.motive, term.cases, application.args[index]!)]
              : []);
            return normalize(apps(branch, ...application.args, ...recursiveResults), environment);
          }
        }
      }
      return recursor(
        term.inductive,
        normalize(term.motive, environment),
        term.cases.map((branch) => normalize(branch, environment)),
        target,
      );
    }
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

function unfoldApplication(term: Term): { readonly head: Term; readonly args: readonly Term[] } {
  const args: Term[] = [];
  let head = term;
  while (head.kind === "app") {
    args.unshift(head.arg);
    head = head.fn;
  }
  return { head, args };
}

function alphaEqual(
  left: Term,
  right: Term,
  leftBound = new Map<string, number>(),
  rightBound = new Map<string, number>(),
  depth = 0,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "type": return right.kind === "type" && left.level === right.level;
    case "const": return right.kind === "const" && left.name === right.name;
    case "var": {
      if (right.kind !== "var") return false;
      const leftDepth = leftBound.get(left.name);
      const rightDepth = rightBound.get(right.name);
      return leftDepth === undefined && rightDepth === undefined
        ? left.name === right.name
        : leftDepth !== undefined && rightDepth !== undefined && leftDepth === rightDepth;
    }
    case "app":
      return right.kind === "app" && alphaEqual(left.fn, right.fn, leftBound, rightBound, depth)
        && alphaEqual(left.arg, right.arg, leftBound, rightBound, depth);
    case "eq":
      return right.kind === "eq" && alphaEqual(left.type, right.type, leftBound, rightBound, depth)
        && alphaEqual(left.left, right.left, leftBound, rightBound, depth)
        && alphaEqual(left.right, right.right, leftBound, rightBound, depth);
    case "refl": return right.kind === "refl" && alphaEqual(left.value, right.value, leftBound, rightBound, depth);
    case "recursor":
      return right.kind === "recursor" && left.inductive === right.inductive
        && alphaEqual(left.motive, right.motive, leftBound, rightBound, depth)
        && left.cases.length === right.cases.length
        && left.cases.every((branch, index) => alphaEqual(branch, right.cases[index]!, leftBound, rightBound, depth))
        && alphaEqual(left.target, right.target, leftBound, rightBound, depth);
    case "subst":
      return right.kind === "subst" && alphaEqual(left.proof, right.proof, leftBound, rightBound, depth)
        && alphaEqual(left.motive, right.motive, leftBound, rightBound, depth)
        && alphaEqual(left.value, right.value, leftBound, rightBound, depth);
    case "pi":
    case "lam": {
      if (right.kind !== left.kind) return false;
      const leftType = left.kind === "pi" ? left.domain : left.paramType;
      const rightType = right.kind === "pi" ? right.domain : right.paramType;
      if (!alphaEqual(leftType, rightType, leftBound, rightBound, depth)) return false;
      const nextLeft = new Map(leftBound);
      const nextRight = new Map(rightBound);
      nextLeft.set(left.param, depth);
      nextRight.set(right.param, depth);
      return alphaEqual(
        left.kind === "pi" ? left.codomain : left.body,
        right.kind === "pi" ? right.codomain : right.body,
        nextLeft,
        nextRight,
        depth + 1,
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
      return { kind: "type", level: universeOf(term.type, context, environment) };
    case "refl": {
      const valueType = infer(term.value, context, environment);
      return equal(valueType, term.value, term.value);
    }
    case "recursor": {
      const declaration = environment.get(term.inductive)?.inductive;
      if (declaration === undefined) throw new KernelError(`unknown inductive type ${term.inductive}`);
      const inductiveType = constant(term.inductive);
      check(term.target, inductiveType, context, environment);
      const motiveType = normalize(infer(term.motive, context, environment), environment);
      if (motiveType.kind !== "pi" || !definitionallyEqual(motiveType.domain, inductiveType, environment)) {
        throw new KernelError(`the ${term.inductive} recursor motive must accept ${term.inductive}`);
      }
      universeOf(motiveType.codomain, new Map(context).set(motiveType.param, inductiveType), environment);
      if (term.cases.length !== declaration.constructors.length) {
        throw new KernelError(`the ${term.inductive} recursor requires ${declaration.constructors.length} cases`);
      }
      for (const [index, constructor] of declaration.constructors.entries()) {
        const fieldVariables = constructor.fields.map((field) => variable(field.name));
        const constructorValue = apps(constant(constructor.name), ...fieldVariables);
        let expected = app(term.motive, constructorValue);
        for (const field of [...constructor.fields.filter((candidate) => candidate.recursive)].reverse()) {
          expected = pi(`ih_${field.name}`, app(term.motive, variable(field.name)), expected);
        }
        for (const field of [...constructor.fields].reverse()) expected = pi(field.name, field.type, expected);
        check(term.cases[index]!, expected, context, environment);
      }
      return app(term.motive, term.target);
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
  if (environment.has(name)) throw new KernelError(`duplicate declaration ${name}`);
  universeOf(declaration.type, new Map(), environment);
  if (declaration.value !== undefined) check(declaration.value, declaration.type, new Map(), environment);
  const next = new Map(environment);
  next.set(name, declaration);
  return next;
}

function containsConstant(term: Term, name: string): boolean {
  switch (term.kind) {
    case "type":
    case "var": return false;
    case "const": return term.name === name;
    case "pi": return containsConstant(term.domain, name) || containsConstant(term.codomain, name);
    case "lam": return containsConstant(term.paramType, name) || containsConstant(term.body, name);
    case "app": return containsConstant(term.fn, name) || containsConstant(term.arg, name);
    case "eq": return containsConstant(term.type, name) || containsConstant(term.left, name) || containsConstant(term.right, name);
    case "refl": return containsConstant(term.value, name);
    case "recursor": return term.inductive === name || containsConstant(term.motive, name)
      || term.cases.some((branch) => containsConstant(branch, name)) || containsConstant(term.target, name);
    case "subst": return containsConstant(term.proof, name) || containsConstant(term.motive, name) || containsConstant(term.value, name);
  }
}

/**
 * Add a strictly-positive inductive family to the trusted environment.
 * The current core supports non-indexed types and rejects every recursive
 * occurrence except a direct, strictly-positive field of the new type.
 */
export function declareInductive(
  name: string,
  constructors: readonly ConstructorInput[],
  environment: Environment,
  level = 0,
): Environment {
  if (environment.has(name)) throw new KernelError(`duplicate declaration ${name}`);
  const names = new Set<string>();
  const shapes: InductiveConstructor[] = [];
  let provisional: Environment = new Map(environment).set(name, { type: { kind: "type", level } });
  for (const constructor of constructors) {
    if (names.has(constructor.name) || provisional.has(constructor.name)) throw new KernelError(`duplicate constructor ${constructor.name}`);
    names.add(constructor.name);
    const context = new Map<string, Term>();
    const fieldNames = new Set<string>();
    const fields: ConstructorField[] = [];
    for (const field of constructor.fields) {
      if (fieldNames.has(field.name)) throw new KernelError(`duplicate field ${field.name} in ${constructor.name}`);
      fieldNames.add(field.name);
      const fieldLevel = universeOf(field.type, context, provisional);
      if (fieldLevel > level) throw new KernelError(`constructor ${constructor.name} has a field above Type ${level}`);
      const recursive = definitionallyEqual(field.type, constant(name), provisional);
      if (!recursive && containsConstant(field.type, name)) {
        throw new KernelError(`constructor ${constructor.name} is not strictly positive`);
      }
      fields.push({ ...field, recursive });
      context.set(field.name, field.type);
    }
    const constructorType = fields.reduceRight<Term>((result, field) => pi(field.name, field.type, result), constant(name));
    provisional = new Map(provisional).set(constructor.name, {
      type: constructorType,
      constructorInfo: { inductive: name, index: shapes.length },
    });
    shapes.push({ name: constructor.name, fields });
  }
  const inductive: InductiveDeclaration = { name, level, constructors: shapes };
  const result = new Map(provisional);
  result.set(name, { type: { kind: "type", level }, inductive });
  return result;
}
