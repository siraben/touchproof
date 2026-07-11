import { allExpressions, expressionEqual, exprToText, replaceById, type Expr } from "./ast.js";
import { programDefinitions, reduceByDefinition } from "./definitions.js";
import { inductiveDefinitions } from "./inductives.js";
import {
  applyProofMove,
  createLessonSession,
  instantiateHypothesis,
  lessonCatalog,
  withDerivedSessionState,
  type EquationGoal,
  type Hypothesis,
  type ProofSession,
  type ProofStep,
} from "./session.js";

/**
 * PROTOCOL FORMAT VERSION 2 (goal trees).
 *
 * Version 1 sessions carried a single optional `analysis` plus a flat goal
 * list; version 2 sessions carry `ancestors` (split goals in split order,
 * each with its `analysis`) plus the leaf `goals`, and generalization is
 * per-goal. Version 1 payloads fail decoding (they cannot describe a valid
 * tree), so clients persisting sessions must bump their storage keys.
 *
 * Decoding is a REPLAY through the real engine: each recorded split is
 * re-derived by validating the ancestor's pre-split transitions against the
 * trusted template and then re-applying the analysis via `applyProofMove`,
 * so a decoded session can only contain states the move engine can reach.
 */
const GOAL_LIMIT = 16;
const ANCESTOR_LIMIT = 8;

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
  return {
    id: item["id"], label: item["label"], context, type: item["type"],
    hypotheses: hypotheses as Hypothesis[], left, right, status: item["status"], steps: steps as ProofStep[],
    generalized: [],
  };
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
  return {
    ...candidate,
    label: template.label,
    context: template.context,
    type: template.type,
    hypotheses: template.hypotheses,
    steps,
    generalized: template.generalized,
    ...(template.parentId === undefined ? {} : { parentId: template.parentId }),
  };
}

function generalizedList(value: unknown, context: readonly string[]): readonly string[] {
  const names = stringArray(value ?? [], 8);
  if (names === undefined) throw new Error("invalid generalized variables");
  const available = context.flatMap((entry) => {
    const separator = entry.indexOf(":");
    return separator < 1 || entry.slice(separator + 1).trim() === "Type"
      ? []
      : entry.slice(0, separator).split(",").map((name) => name.trim());
  });
  if (new Set(names).size !== names.length || names.some((name) => !available.includes(name))) throw new Error("invalid generalized variables");
  return names;
}

function analysisPayload(value: unknown): { readonly kind: "cases" | "induction"; readonly variable: string } {
  const item = record(value);
  if ((item?.["kind"] !== "cases" && item?.["kind"] !== "induction")
    || typeof item["variable"] !== "string" || !IDENTIFIER.test(item["variable"])) throw new Error("invalid proof analysis");
  return { kind: item["kind"], variable: item["variable"] };
}

function decode(value: unknown, preserveServerStatus: boolean): ProofSession {
  const item = record(value);
  if (item === undefined || typeof item["lessonId"] !== "string" || !lessonCatalog.some((lesson) => lesson.id === item["lessonId"])
    || typeof item["theorem"] !== "string" || typeof item["statement"] !== "string" || typeof item["focusedGoalId"] !== "string"
    || (item["kernelStatus"] !== "pending" && item["kernelStatus"] !== "checked")) throw new Error("invalid proof state");
  const theoremContext = stringArray(item["theoremContext"]);
  const definitionNames = stringArray(item["definitionNames"]);
  const inductiveNames = stringArray(item["inductiveNames"]);
  const theoremLeft = expression(item["theoremLeft"]);
  const theoremRight = expression(item["theoremRight"]);
  if (theoremContext === undefined || definitionNames === undefined || inductiveNames === undefined || theoremLeft === undefined || theoremRight === undefined
    || !Array.isArray(item["goals"]) || item["goals"].length === 0 || item["goals"].length > GOAL_LIMIT) throw new Error("invalid proof state");
  const rawAncestors = item["ancestors"] ?? [];
  if (!Array.isArray(rawAncestors) || rawAncestors.length > ANCESTOR_LIMIT) throw new Error("invalid proof state");

  // Replay every recorded split through the move engine, parent before child.
  let trusted = createLessonSession(item["lessonId"]);
  for (const rawAncestor of rawAncestors) {
    const ancestorRecord = record(rawAncestor);
    const candidate = ancestorRecord === undefined ? undefined : goal(rawAncestor);
    if (candidate === undefined) throw new Error("invalid proof state");
    const analysis = analysisPayload(ancestorRecord!["analysis"]);
    const template = trusted.goals.find((entry) => entry.id === candidate.id);
    if (template === undefined) throw new Error("proof state has an invalid branch set");
    const generalized = generalizedList(ancestorRecord!["generalized"], template.context);
    const normalized = { ...normalizeGoal({ ...candidate, status: "open" }, template), generalized };
    trusted = {
      ...trusted,
      goals: trusted.goals.map((entry) => entry.id === candidate.id ? normalized : entry),
      focusedGoalId: candidate.id,
    };
    trusted = applyProofMove(trusted, `${analysis.kind}:${analysis.variable}`);
  }

  const leafPayloads = item["goals"].map((rawGoal) => {
    const candidate = goal(rawGoal);
    const raw = record(rawGoal);
    if (candidate === undefined || raw === undefined) throw new Error("invalid proof state");
    return { candidate, raw };
  });
  if (new Set(leafPayloads.map((entry) => entry.candidate.id)).size !== leafPayloads.length) throw new Error("proof state contains duplicate goals");
  if (leafPayloads.length !== trusted.goals.length) throw new Error("proof state has an invalid branch set");
  const normalized = trusted.goals.map((template) => {
    const payload = leafPayloads.find((entry) => entry.candidate.id === template.id);
    if (payload === undefined) throw new Error("proof state has an unknown goal");
    const generalized = generalizedList(payload.raw["generalized"], template.context);
    return { ...normalizeGoal(payload.candidate, template), generalized };
  });
  if (!normalized.some((entry) => entry.id === item["focusedGoalId"])) throw new Error("invalid proof state");
  if (preserveServerStatus && item["kernelStatus"] === "checked" && normalized.some((entry) => entry.status !== "solved")) {
    throw new Error("checked proof state contains open goals");
  }
  return withDerivedSessionState({
    ...trusted,
    goals: normalized,
    focusedGoalId: item["focusedGoalId"],
    kernelStatus: preserveServerStatus ? item["kernelStatus"] : "pending",
  });
}

export function decodeProofSession(value: unknown): ProofSession {
  return decode(value, false);
}

export function decodeServerProofSession(value: unknown): ProofSession {
  return decode(value, true);
}
