import { call, cloneFresh, ctor, parseProgramExpr, programVar, type Expr } from "./ast.js";

export interface DefinitionClause {
  readonly label: string;
  readonly patterns: readonly Expr[];
  readonly result: Expr;
  readonly script: string;
}

export interface ProgramDefinition {
  readonly name: string;
  readonly arity: number;
  readonly type: string;
  readonly clauses: readonly DefinitionClause[];
}

function clause(label: string, patterns: readonly string[], result: string, script: string): DefinitionClause {
  return { label, patterns: patterns.map(parseProgramExpr), result: parseProgramExpr(result), script };
}

export const programDefinitions: readonly ProgramDefinition[] = [
  { name: "negb", arity: 1, type: "Bool → Bool", clauses: [
    clause("true", ["true"], "false", "negb true = false"),
    clause("false", ["false"], "true", "negb false = true"),
  ] },
  { name: "add", arity: 2, type: "Nat → Nat → Nat", clauses: [
    clause("zero", ["zero", "m"], "m", "0 + m = m"),
    clause("successor", ["succ(n)", "m"], "succ(add(n, m))", "S n + m = S (n + m)"),
  ] },
  { name: "append", arity: 2, type: "List A → List A → List A", clauses: [
    clause("nil", ["nil", "ys"], "ys", "[] ++ ys = ys"),
    clause("cons", ["cons(x, xs)", "ys"], "cons(x, append(xs, ys))", "(x :: xs) ++ ys = x :: (xs ++ ys)"),
  ] },
  { name: "map", arity: 2, type: "(A → B) → List A → List B", clauses: [
    clause("nil", ["f", "nil"], "nil", "map f [] = []"),
    clause("cons", ["f", "cons(x, xs)"], "cons(apply(f, x), map(f, xs))", "map f (x :: xs) = f x :: map f xs"),
  ] },
  { name: "rev", arity: 1, type: "List A → List A", clauses: [
    clause("nil", ["nil"], "nil", "rev [] = []"),
    clause("cons", ["cons(x, xs)"], "append(rev(xs), cons(x, nil))", "rev (x :: xs) = rev xs ++ [x]"),
  ] },
  { name: "revAcc", arity: 2, type: "List A → List A → List A", clauses: [
    clause("nil", ["nil", "acc"], "acc", "revAcc [] acc = acc"),
    clause("cons", ["cons(x, xs)", "acc"], "revAcc(xs, cons(x, acc))", "revAcc (x :: xs) acc = revAcc xs (x :: acc)"),
  ] },
  { name: "apply", arity: 2, type: "(A → B) → A → B", clauses: [
    clause("composition", ["compose(f, g)", "x"], "apply(f, apply(g, x))", "(f ∘ g) x = f (g x)"),
  ] },
  { name: "compose", arity: 2, type: "(B → C) → (A → B) → A → C", clauses: [] },
] as const;

export function definitionByName(name: string): ProgramDefinition | undefined {
  return programDefinitions.find((definition) => definition.name === name);
}

type Bindings = Map<string, Expr>;

function match(pattern: Expr, value: Expr, bindings: Bindings): boolean {
  if (pattern.kind === "var") {
    const previous = bindings.get(pattern.name);
    if (previous === undefined) {
      bindings.set(pattern.name, value);
      return true;
    }
    return JSON.stringify(stripIds(previous)) === JSON.stringify(stripIds(value));
  }
  if (pattern.kind !== value.kind || pattern.name !== value.name || pattern.args.length !== value.args.length) return false;
  return pattern.args.every((child, index) => match(child, value.args[index]!, bindings));
}

function stripIds(expr: Expr): unknown {
  return expr.kind === "var" ? { kind: expr.kind, name: expr.name }
    : { kind: expr.kind, name: expr.name, args: expr.args.map(stripIds) };
}

function instantiate(template: Expr, bindings: Bindings): Expr {
  if (template.kind === "var") return cloneFresh(bindings.get(template.name) ?? programVar(template.name));
  const args = template.args.map((child) => instantiate(child, bindings));
  return template.kind === "ctor" ? ctor(template.name, args) : call(template.name, args);
}

export interface Reduction {
  readonly expression: Expr;
  readonly definition: ProgramDefinition;
  readonly clause: DefinitionClause;
}

export function reduceByDefinition(expression: Expr): Reduction | undefined {
  if (expression.kind !== "call") return undefined;
  const definition = definitionByName(expression.name);
  if (definition === undefined) return undefined;
  for (const candidate of definition.clauses) {
    if (candidate.patterns.length !== expression.args.length) continue;
    const bindings: Bindings = new Map();
    if (!candidate.patterns.every((pattern, index) => match(pattern, expression.args[index]!, bindings))) continue;
    return { expression: { ...instantiate(candidate.result, bindings), id: expression.id }, definition, clause: candidate };
  }
  return undefined;
}

export function definitionsToScript(names: readonly string[]): string {
  return names.map((name) => {
    const definition = definitionByName(name);
    if (definition === undefined) return "";
    return `def ${definition.name} : ${definition.type}\n${definition.clauses.map((item) => `  | ${item.script}`).join("\n")}`;
  }).filter(Boolean).join("\n\n");
}
