import { allExpressions, expressionEqual, exprToText, replaceById, type Expr } from "./ast.js";
import { programDefinitions, reduceByDefinition } from "./definitions.js";
import { inductiveDefinitions } from "./inductives.js";
import {
  applyProofMove,
  createLessonSession,
  freshHypothesisName,
  instantiateHypothesis,
  isPropositionGoal,
  lessonCatalog,
  withDerivedSessionState,
  type EquationGoal,
  type Hypothesis,
  type ProofGoal,
  type ProofSession,
  type ProofStep,
  type PropositionGoal,
  type PropositionHypothesis,
  type PropositionStep,
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

/**
 * The proposition grammar at the trust boundary: atoms (variables) and the
 * binary connectives `and` / `imp`, nothing else. Program calls and
 * constructors are NOT propositions.
 */
function propositionExpression(value: unknown, depth = 0): Expr | undefined {
  if (depth > 16) return undefined;
  const item = record(value);
  if (item === undefined || typeof item["id"] !== "string" || typeof item["name"] !== "string" || !IDENTIFIER.test(item["name"])) return undefined;
  if (item["kind"] === "var") return { id: item["id"], kind: "var", name: item["name"] };
  if (item["kind"] !== "call" || (item["name"] !== "and" && item["name"] !== "imp")
    || !Array.isArray(item["args"]) || item["args"].length !== 2) return undefined;
  const args = item["args"].map((child) => propositionExpression(child, depth + 1));
  if (args.some((child) => child === undefined)) return undefined;
  return { id: item["id"], kind: "call", name: item["name"], args: args as Expr[] };
}

function propositionHypothesis(value: unknown): PropositionHypothesis | undefined {
  const item = record(value);
  const proposition = propositionExpression(item?.["proposition"]);
  return item !== undefined && typeof item["id"] === "string" && typeof item["name"] === "string" && proposition !== undefined
    ? { id: item["id"], name: item["name"], proposition }
    : undefined;
}

function propositionStep(value: unknown): PropositionStep | undefined {
  const item = record(value);
  const proposition = propositionExpression(item?.["proposition"]);
  return item !== undefined && typeof item["reason"] === "string" && proposition !== undefined
    ? { proposition, reason: item["reason"] }
    : undefined;
}

function propositionGoal(value: unknown): PropositionGoal | undefined {
  const item = record(value);
  const context = stringArray(item?.["context"]);
  const proposition = propositionExpression(item?.["proposition"]);
  if (item === undefined || typeof item["id"] !== "string" || typeof item["label"] !== "string"
    || (item["status"] !== "open" && item["status"] !== "solved") || context === undefined || proposition === undefined
    || !Array.isArray(item["hypotheses"]) || item["hypotheses"].length > 16 || !Array.isArray(item["steps"]) || item["steps"].length > 32) return undefined;
  const hypotheses = item["hypotheses"].map(propositionHypothesis);
  const steps = item["steps"].map(propositionStep);
  if (hypotheses.some((entry) => entry === undefined) || steps.length === 0 || steps.some((entry) => entry === undefined)) return undefined;
  return {
    id: item["id"], label: item["label"], context,
    hypotheses: hypotheses as PropositionHypothesis[], proposition, status: item["status"], steps: steps as PropositionStep[],
  };
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

function hasUniquePropositionIds(proposition: Expr): boolean {
  const ids = allExpressions(proposition).map((entry) => entry.id);
  return new Set(ids).size === ids.length;
}

/**
 * Replays a proposition goal's recorded history against the trusted
 * template: every transition must be an enumerated move (an intro on an
 * implication, or a final exact whose witness exists). Reasons, hypothesis
 * lists, and intro names are RE-DERIVED, never trusted.
 */
function normalizePropositionGoal(candidate: PropositionGoal, template: PropositionGoal): PropositionGoal {
  const first = candidate.steps[0];
  if (first === undefined || !expressionEqual(first.proposition, template.proposition)) {
    throw new Error("proof history has an invalid starting point");
  }
  if (!hasUniquePropositionIds(first.proposition)) throw new Error("proof history contains duplicate expression ids");
  const steps: PropositionStep[] = [{ proposition: first.proposition, reason: template.steps[0]!.reason }];
  let hypotheses: PropositionHypothesis[] = [...template.hypotheses];
  let current = first.proposition;
  for (let index = 1; index < candidate.steps.length; index += 1) {
    const next = candidate.steps[index]!;
    if (!hasUniquePropositionIds(next.proposition)) throw new Error("proof history contains duplicate expression ids");
    if (current.kind !== "var" && current.name === "imp" && expressionEqual(next.proposition, current.args[1]!)) {
      const name = freshHypothesisName({ context: template.context, hypotheses });
      hypotheses = [...hypotheses, { id: `hyp-${name}`, name, proposition: current.args[0]! }];
      steps.push({ proposition: next.proposition, reason: `intro ${name}` });
      current = next.proposition;
      continue;
    }
    if (expressionEqual(next.proposition, current) && index === candidate.steps.length - 1 && candidate.status === "solved") {
      const witness = hypotheses.find((entry) => expressionEqual(entry.proposition, current));
      if (witness === undefined) throw new Error("proof history contains a non-enumerated transition");
      steps.push({ proposition: next.proposition, reason: `exact ${witness.name}` });
      continue;
    }
    throw new Error("proof history contains an invalid transition");
  }
  if (!expressionEqual(candidate.proposition, steps.at(-1)!.proposition)) throw new Error("proof state does not match its history");
  if (candidate.status === "solved" && !steps.at(-1)!.reason.startsWith("exact ")) throw new Error("a solved proposition must end with exact");
  return {
    ...candidate,
    label: template.label,
    context: template.context,
    hypotheses,
    steps,
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

/** The move id a recorded analysis replays through; the move engine decides its legality. */
function analysisMoveId(value: unknown, template: ProofGoal): string {
  const item = record(value);
  if (isPropositionGoal(template)) {
    if (item?.["kind"] === "split") return "split";
    if (item?.["kind"] === "destruct" && typeof item["hypothesisId"] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(item["hypothesisId"])) {
      return `destruct:${item["hypothesisId"]}`;
    }
    throw new Error("invalid proof analysis");
  }
  if ((item?.["kind"] !== "cases" && item?.["kind"] !== "induction")
    || typeof item["variable"] !== "string" || !IDENTIFIER.test(item["variable"])) throw new Error("invalid proof analysis");
  return `${item["kind"]}:${item["variable"]}`;
}

/** Validates a leaf/ancestor payload against its trusted template, dispatching on the goal's shape. */
function normalizeAgainstTemplate(raw: Record<string, unknown>, template: ProofGoal, forceOpen: boolean): ProofGoal {
  if (isPropositionGoal(template)) {
    const candidate = propositionGoal(raw);
    if (candidate === undefined) throw new Error("invalid proof state");
    return normalizePropositionGoal(forceOpen ? { ...candidate, status: "open" } : candidate, template);
  }
  const candidate = goal(raw);
  if (candidate === undefined) throw new Error("invalid proof state");
  const generalized = generalizedList(raw["generalized"], template.context);
  return { ...normalizeGoal(forceOpen ? { ...candidate, status: "open" } : candidate, template), generalized };
}

function decode(value: unknown, preserveServerStatus: boolean): ProofSession {
  const item = record(value);
  if (item === undefined || typeof item["lessonId"] !== "string" || !lessonCatalog.some((lesson) => lesson.id === item["lessonId"])
    || typeof item["theorem"] !== "string" || typeof item["statement"] !== "string" || typeof item["focusedGoalId"] !== "string"
    || (item["kernelStatus"] !== "pending" && item["kernelStatus"] !== "checked")) throw new Error("invalid proof state");
  const theoremContext = stringArray(item["theoremContext"]);
  const definitionNames = stringArray(item["definitionNames"]);
  const inductiveNames = stringArray(item["inductiveNames"]);
  if (theoremContext === undefined || definitionNames === undefined || inductiveNames === undefined
    || !Array.isArray(item["goals"]) || item["goals"].length === 0 || item["goals"].length > GOAL_LIMIT) throw new Error("invalid proof state");
  const rawAncestors = item["ancestors"] ?? [];
  if (!Array.isArray(rawAncestors) || rawAncestors.length > ANCESTOR_LIMIT) throw new Error("invalid proof state");

  // Replay every recorded split through the move engine, parent before child.
  let trusted = createLessonSession(item["lessonId"]);
  if (trusted.theoremProposition === undefined) {
    if (expression(item["theoremLeft"]) === undefined || expression(item["theoremRight"]) === undefined) throw new Error("invalid proof state");
  } else if (propositionExpression(item["theoremProposition"]) === undefined) throw new Error("invalid proof state");
  for (const rawAncestor of rawAncestors) {
    const ancestorRecord = record(rawAncestor);
    if (ancestorRecord === undefined || typeof ancestorRecord["id"] !== "string") throw new Error("invalid proof state");
    const template = trusted.goals.find((entry) => entry.id === ancestorRecord["id"]);
    if (template === undefined) throw new Error("proof state has an invalid branch set");
    const normalized = normalizeAgainstTemplate(ancestorRecord, template, true);
    const moveId = analysisMoveId(ancestorRecord["analysis"], template);
    trusted = {
      ...trusted,
      goals: trusted.goals.map((entry) => entry.id === normalized.id ? normalized : entry),
      focusedGoalId: normalized.id,
    };
    trusted = applyProofMove(trusted, moveId);
  }

  const leafPayloads = item["goals"].map((rawGoal) => {
    const raw = record(rawGoal);
    if (raw === undefined || typeof raw["id"] !== "string") throw new Error("invalid proof state");
    return raw;
  });
  if (new Set(leafPayloads.map((entry) => entry["id"])).size !== leafPayloads.length) throw new Error("proof state contains duplicate goals");
  if (leafPayloads.length !== trusted.goals.length) throw new Error("proof state has an invalid branch set");
  const normalized = trusted.goals.map((template) => {
    const payload = leafPayloads.find((entry) => entry["id"] === template.id);
    if (payload === undefined) throw new Error("proof state has an unknown goal");
    return normalizeAgainstTemplate(payload, template, false);
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
