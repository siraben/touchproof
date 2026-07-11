import { allExpressions, expressionEqual, exprToText, replaceById, type Expr } from "./ast.js";
import { programDefinitions, reduceByDefinition } from "./definitions.js";
import { inductiveDefinitions } from "./inductives.js";
import { applyProofMove, createLessonSession, instantiateHypothesis, lessonCatalog, type EquationGoal, type Hypothesis, type ProofSession, type ProofStep } from "./session.js";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CALL_ARITIES: Readonly<Record<string, number>> = Object.fromEntries(programDefinitions.map((definition) => [definition.name, definition.arity]));
const CONSTRUCTOR_ARITIES: Readonly<Record<string, number>> = Object.fromEntries(inductiveDefinitions.flatMap((inductive) =>
  inductive.constructors.map((constructor) => [constructor.name, constructor.fields.length] as const)));

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringArray(value: unknown, maximum = 32): readonly string[] | undefined {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === "string") ? value : undefined;
}

function expression(value: unknown, depth = 0): Expr | undefined {
  if (depth > 40) return undefined;
  const item = record(value);
  if (item === undefined || typeof item["id"] !== "string" || typeof item["name"] !== "string" || !IDENTIFIER.test(item["name"])) return undefined;
  if (item["kind"] === "var") return { id: item["id"], kind: "var", name: item["name"] };
  if ((item["kind"] !== "ctor" && item["kind"] !== "call") || !Array.isArray(item["args"]) || item["args"].length > 8) return undefined;
  const expectedArity = item["kind"] === "ctor" ? CONSTRUCTOR_ARITIES[item["name"]] : CALL_ARITIES[item["name"]];
  if (expectedArity === undefined || item["args"].length !== expectedArity) return undefined;
  const args = item["args"].map((child) => expression(child, depth + 1));
  if (args.some((child) => child === undefined)) return undefined;
  return { id: item["id"], kind: item["kind"], name: item["name"], args: args as Expr[] };
}

function hypothesis(value: unknown): Hypothesis | undefined {
  const item = record(value);
  const left = expression(item?.["left"]);
  const right = expression(item?.["right"]);
  const binders = item?.["binders"] === undefined ? undefined : Array.isArray(item["binders"])
    ? item["binders"].map((value) => {
        const binder = record(value);
        return typeof binder?.["name"] === "string" && typeof binder["type"] === "string"
          ? { name: binder["name"], type: binder["type"] }
          : undefined;
      })
    : undefined;
  return item !== undefined && typeof item["id"] === "string" && typeof item["name"] === "string" && left !== undefined && right !== undefined
    && (binders === undefined || !binders.some((binder) => binder === undefined))
    ? { id: item["id"], name: item["name"], left, right, ...(binders === undefined ? {} : { binders: binders as { name: string; type: string }[] }) }
    : undefined;
}

function proofStep(value: unknown): ProofStep | undefined {
  const item = record(value);
  const left = expression(item?.["left"]);
  const right = expression(item?.["right"]);
  return item !== undefined && typeof item["reason"] === "string" && left !== undefined && right !== undefined
    ? { equation: `${exprToText(left)} = ${exprToText(right)}`, reason: item["reason"], left, right }
    : undefined;
}

function goal(value: unknown): EquationGoal | undefined {
  const item = record(value);
  const context = stringArray(item?.["context"]);
  const left = expression(item?.["left"]);
  const right = expression(item?.["right"]);
  if (item === undefined || typeof item["id"] !== "string" || typeof item["label"] !== "string"
    || typeof item["type"] !== "string" || (item["status"] !== "open" && item["status"] !== "solved") || context === undefined || left === undefined || right === undefined
    || !Array.isArray(item["hypotheses"]) || item["hypotheses"].length > 16 || !Array.isArray(item["steps"]) || item["steps"].length > 128) return undefined;
  const hypotheses = item["hypotheses"].map(hypothesis);
  const steps = item["steps"].map(proofStep);
  if (hypotheses.some((entry) => entry === undefined) || steps.length === 0 || steps.some((entry) => entry === undefined)) return undefined;
  return { id: item["id"], label: item["label"], context, type: item["type"], hypotheses: hypotheses as Hypothesis[], left, right, status: item["status"], steps: steps as ProofStep[] };
}

function trustedTemplates(session: ProofSession, incoming: readonly EquationGoal[]): readonly EquationGoal[] {
  if (incoming.length === 1 && incoming[0]?.id === "goal-root") return session.goals;
  if (session.goals[0]?.id !== "goal-root") return session.goals;
  if (session.analysis === undefined) throw new Error("invalid proof state");
  return applyProofMove(session, `${session.analysis.kind}:${session.analysis.variable}`).goals;
}

function transitionReason(previous: ProofStep, next: ProofStep, template: EquationGoal): string | undefined {
  const leftChanged = !expressionEqual(previous.left, next.left);
  const rightChanged = !expressionEqual(previous.right, next.right);
  if (leftChanged === rightChanged) return undefined;
  const side = leftChanged ? "left" : "right";
  const before = previous[side];
  const after = next[side];
  for (const expression of allExpressions(before)) {
    const reduction = reduceByDefinition(expression);
    if (reduction !== undefined && expressionEqual(replaceById(before, expression.id, reduction.expression), after)) {
      return `${reduction.definition.name} case: ${reduction.clause.label}`;
    }
  }
  for (const hypothesis of template.hypotheses) {
    for (const expression of allExpressions(before)) {
      const replacement = instantiateHypothesis(hypothesis, expression);
      if (replacement !== undefined && expressionEqual(replaceById(before, expression.id, replacement), after)) {
        return `rewrite with ${hypothesis.name}`;
      }
    }
  }
  return undefined;
}

function hasUniqueExpressionIds(left: Expr, right: Expr): boolean {
  const ids = [...allExpressions(left), ...allExpressions(right)].map((entry) => entry.id);
  return new Set(ids).size === ids.length;
}

function normalizeGoal(candidate: EquationGoal, template: EquationGoal): EquationGoal {
  const first = candidate.steps[0];
  if (first === undefined || !expressionEqual(first.left, template.left) || !expressionEqual(first.right, template.right)) throw new Error("proof history has an invalid starting point");
  const steps: ProofStep[] = [{ ...first, equation: `${exprToText(first.left)} = ${exprToText(first.right)}`, reason: template.steps[0]!.reason }];
  if (!hasUniqueExpressionIds(first.left, first.right)) throw new Error("proof history contains duplicate expression ids");
  for (let index = 1; index < candidate.steps.length; index += 1) {
    const previous = steps[index - 1]!;
    const next = candidate.steps[index]!;
    if (!hasUniqueExpressionIds(next.left, next.right)) throw new Error("proof history contains duplicate expression ids");
    const unchanged = expressionEqual(previous.left, next.left) && expressionEqual(previous.right, next.right);
    if (unchanged) {
      if (index === candidate.steps.length - 1 && candidate.status === "solved" && expressionEqual(next.left, next.right)) {
        steps.push({ ...next, equation: `${exprToText(next.left)} = ${exprToText(next.right)}`, reason: "reflexivity" });
        continue;
      }
      throw new Error("proof history contains an invalid transition");
    }
    const reason = transitionReason(previous, next, template);
    if (reason === undefined) throw new Error("proof history contains a non-enumerated transition");
    steps.push({ ...next, equation: `${exprToText(next.left)} = ${exprToText(next.right)}`, reason });
  }
  const last = steps.at(-1)!;
  if (!expressionEqual(candidate.left, last.left) || !expressionEqual(candidate.right, last.right)) throw new Error("proof state does not match its history");
  if (candidate.status === "solved" && !expressionEqual(candidate.left, candidate.right)) throw new Error("a non-reflexive goal cannot be marked solved");
  if (candidate.status === "solved" && steps.at(-1)?.reason !== "reflexivity") throw new Error("a solved goal must end with reflexivity");
  if (!hasUniqueExpressionIds(candidate.left, candidate.right)) throw new Error("proof state contains duplicate expression ids");
  return { ...candidate, label: template.label, context: template.context, type: template.type, hypotheses: template.hypotheses, steps };
}

function decode(value: unknown, preserveServerStatus: boolean): ProofSession {
  const item = record(value);
  if (item === undefined || typeof item["lessonId"] !== "string" || !lessonCatalog.some((lesson) => lesson.id === item["lessonId"])
    || typeof item["theorem"] !== "string" || typeof item["statement"] !== "string" || typeof item["focusedGoalId"] !== "string"
    || (item["kernelStatus"] !== "pending" && item["kernelStatus"] !== "checked")) throw new Error("invalid proof state");
  const theoremContext = stringArray(item["theoremContext"]);
  const generalizedVariables = stringArray(item["generalizedVariables"]);
  const definitionNames = stringArray(item["definitionNames"]);
  const inductiveNames = stringArray(item["inductiveNames"]);
  const theoremLeft = expression(item["theoremLeft"]);
  const theoremRight = expression(item["theoremRight"]);
  if (theoremContext === undefined || generalizedVariables === undefined || definitionNames === undefined || inductiveNames === undefined || theoremLeft === undefined || theoremRight === undefined
    || !Array.isArray(item["goals"]) || item["goals"].length === 0 || item["goals"].length > 8) throw new Error("invalid proof state");
  const goals = item["goals"].map(goal);
  if (goals.some((entry) => entry === undefined) || !goals.some((entry) => entry?.id === item["focusedGoalId"])) throw new Error("invalid proof state");
  let trusted = createLessonSession(item["lessonId"]);
  const availableVariables = trusted.theoremContext.flatMap((entry) => {
    const separator = entry.indexOf(":");
    return separator < 1 || entry.slice(separator + 1).trim() === "Type"
      ? []
      : entry.slice(0, separator).split(",").map((name) => name.trim());
  });
  if (new Set(generalizedVariables).size !== generalizedVariables.length
    || generalizedVariables.some((name) => !availableVariables.includes(name))) throw new Error("invalid generalized variables");
  trusted = { ...trusted, generalizedVariables };
  if (item["analysis"] !== undefined) {
    const analysis = record(item["analysis"]);
    if ((analysis?.["kind"] !== "cases" && analysis?.["kind"] !== "induction")
      || typeof analysis["variable"] !== "string"
      || (analysis["type"] !== "Bool" && analysis["type"] !== "Nat" && analysis["type"] !== "List")
      || generalizedVariables.includes(analysis["variable"])) throw new Error("invalid proof analysis");
    trusted = applyProofMove(trusted, `${analysis["kind"]}:${analysis["variable"]}`);
    if (trusted.analysis?.type !== analysis["type"]) throw new Error("proof analysis has the wrong type");
  }
  const decodedGoals = goals as EquationGoal[];
  const templates = trustedTemplates(trusted, decodedGoals);
  if (templates.length !== decodedGoals.length) throw new Error("proof state has an invalid branch set");
  const normalized = decodedGoals.map((candidate) => {
    const template = templates.find((entry) => entry.id === candidate.id);
    if (template === undefined) throw new Error("proof state has an unknown goal");
    return normalizeGoal(candidate, template);
  });
  if (preserveServerStatus && item["kernelStatus"] === "checked" && normalized.some((entry) => entry.status !== "solved")) {
    throw new Error("checked proof state contains open goals");
  }
  if (new Set(normalized.map((entry) => entry.id)).size !== normalized.length) throw new Error("proof state contains duplicate goals");
  return {
    ...trusted,
    goals: normalized, focusedGoalId: item["focusedGoalId"],
    kernelStatus: preserveServerStatus ? item["kernelStatus"] : "pending",
  };
}

export function decodeProofSession(value: unknown): ProofSession {
  return decode(value, false);
}

export function decodeServerProofSession(value: unknown): ProofSession {
  return decode(value, true);
}
