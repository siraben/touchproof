export type Term =
  | { readonly kind: "type"; readonly level: number }
  | { readonly kind: "var"; readonly name: string }
  | { readonly kind: "const"; readonly name: string }
  | {
      readonly kind: "pi";
      readonly param: string;
      readonly domain: Term;
      readonly codomain: Term;
    }
  | {
      readonly kind: "lam";
      readonly param: string;
      readonly paramType: Term;
      readonly body: Term;
    }
  | { readonly kind: "app"; readonly fn: Term; readonly arg: Term }
  | { readonly kind: "eq"; readonly type: Term; readonly left: Term; readonly right: Term }
  | { readonly kind: "refl"; readonly value: Term }
  | {
      readonly kind: "subst";
      readonly proof: Term;
      readonly motive: Term;
      readonly value: Term;
    };

export const type = (level = 0): Term => ({ kind: "type", level });
export const variable = (name: string): Term => ({ kind: "var", name });
export const constant = (name: string): Term => ({ kind: "const", name });
export const pi = (param: string, domain: Term, codomain: Term): Term => ({
  kind: "pi",
  param,
  domain,
  codomain,
});
export const arrow = (domain: Term, codomain: Term): Term => pi("_", domain, codomain);
export const lambda = (param: string, paramType: Term, body: Term): Term => ({
  kind: "lam",
  param,
  paramType,
  body,
});
export const app = (fn: Term, arg: Term): Term => ({ kind: "app", fn, arg });
export const apps = (fn: Term, ...args: Term[]): Term => args.reduce(app, fn);
export const equal = (valueType: Term, left: Term, right: Term): Term => ({
  kind: "eq",
  type: valueType,
  left,
  right,
});
export const refl = (value: Term): Term => ({ kind: "refl", value });
export const subst = (proof: Term, motive: Term, value: Term): Term => ({
  kind: "subst",
  proof,
  motive,
  value,
});

export function freeVariables(term: Term, bound = new Set<string>()): Set<string> {
  const result = new Set<string>();
  const visit = (current: Term, scope: Set<string>): void => {
    switch (current.kind) {
      case "type":
      case "const":
        return;
      case "var":
        if (!scope.has(current.name)) result.add(current.name);
        return;
      case "pi":
      case "lam": {
        visit(current.kind === "pi" ? current.domain : current.paramType, scope);
        const inner = new Set(scope);
        inner.add(current.param);
        visit(current.kind === "pi" ? current.codomain : current.body, inner);
        return;
      }
      case "app":
        visit(current.fn, scope);
        visit(current.arg, scope);
        return;
      case "eq":
        visit(current.type, scope);
        visit(current.left, scope);
        visit(current.right, scope);
        return;
      case "refl":
        visit(current.value, scope);
        return;
      case "subst":
        visit(current.proof, scope);
        visit(current.motive, scope);
        visit(current.value, scope);
    }
  };
  visit(term, bound);
  return result;
}

function freshName(base: string, forbidden: ReadonlySet<string>): string {
  let candidate = base;
  let suffix = 0;
  while (forbidden.has(candidate)) candidate = `${base}${++suffix}`;
  return candidate;
}

/** Capture-avoiding substitution of free occurrences. */
export function substitute(term: Term, name: string, replacement: Term): Term {
  const replacementFree = freeVariables(replacement);
  const go = (current: Term): Term => {
    switch (current.kind) {
      case "type":
      case "const":
        return current;
      case "var":
        return current.name === name ? replacement : current;
      case "app":
        return app(go(current.fn), go(current.arg));
      case "eq":
        return equal(go(current.type), go(current.left), go(current.right));
      case "refl":
        return refl(go(current.value));
      case "subst":
        return subst(go(current.proof), go(current.motive), go(current.value));
      case "pi":
      case "lam": {
        const annotation = go(current.kind === "pi" ? current.domain : current.paramType);
        if (current.param === name) {
          return current.kind === "pi"
            ? pi(current.param, annotation, current.codomain)
            : lambda(current.param, annotation, current.body);
        }
        let param = current.param;
        let body = current.kind === "pi" ? current.codomain : current.body;
        if (replacementFree.has(param)) {
          const forbidden = new Set([...replacementFree, ...freeVariables(body), name]);
          const renamed = freshName(param, forbidden);
          body = substitute(body, param, variable(renamed));
          param = renamed;
        }
        const substituted = go(body);
        return current.kind === "pi"
          ? pi(param, annotation, substituted)
          : lambda(param, annotation, substituted);
      }
    }
  };
  return go(term);
}

export function termToString(term: Term): string {
  switch (term.kind) {
    case "type": return `Type ${term.level}`;
    case "var": return term.name;
    case "const": return term.name;
    case "pi": return `(Π ${term.param} : ${termToString(term.domain)}, ${termToString(term.codomain)})`;
    case "lam": return `(λ ${term.param} : ${termToString(term.paramType)}, ${termToString(term.body)})`;
    case "app": return `(${termToString(term.fn)} ${termToString(term.arg)})`;
    case "eq": return `(${termToString(term.left)} = ${termToString(term.right)})`;
    case "refl": return `refl ${termToString(term.value)}`;
    case "subst": return `subst ${termToString(term.proof)} ${termToString(term.motive)} ${termToString(term.value)}`;
  }
}
