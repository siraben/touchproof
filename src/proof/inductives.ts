export interface ConstructorField {
  readonly name: string;
  readonly type: string;
  readonly recursive?: boolean;
}

export interface ConstructorDefinition {
  readonly name: string;
  readonly label: string;
  readonly fields: readonly ConstructorField[];
}

export interface InductiveDefinition {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly constructors: readonly ConstructorDefinition[];
}

export const inductiveDefinitions: readonly InductiveDefinition[] = [
  { name: "Bool", parameters: [], constructors: [
    { name: "true", label: "true", fields: [] },
    { name: "false", label: "false", fields: [] },
  ] },
  { name: "Nat", parameters: [], constructors: [
    { name: "zero", label: "0", fields: [] },
    { name: "succ", label: "S n", fields: [{ name: "n", type: "Nat", recursive: true }] },
  ] },
  { name: "List", parameters: ["A : Type"], constructors: [
    { name: "nil", label: "empty list", fields: [] },
    { name: "cons", label: "x :: xs", fields: [
      { name: "x", type: "A" },
      { name: "xs", type: "List A", recursive: true },
    ] },
  ] },
] as const;

export function inductiveByName(name: string): InductiveDefinition | undefined {
  return inductiveDefinitions.find((definition) => definition.name === name);
}

export function inductiveToScript(definition: InductiveDefinition): string {
  const parameters = definition.parameters.length === 0 ? "" : ` (${definition.parameters.join(", ")})`;
  return `data ${definition.name}${parameters} where\n${definition.constructors.map((constructor) =>
    `  | ${constructor.name}${constructor.fields.length === 0 ? "" : ` (${constructor.fields.map((field) => `${field.name} : ${field.type}`).join(", ")})`}`,
  ).join("\n")}`;
}
