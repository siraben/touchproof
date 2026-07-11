import { describe, expect, it } from "vitest";
import {
  applyProofMove,
  createLessonSession,
  createMapCompositionSession,
  enumerateProofMoves,
  equationToText,
  type EquationGoal,
} from "../../src/proof/session.js";
import { checkProofSession } from "../../src/proof/certificate.js";

function applyFirst(session: ReturnType<typeof createMapCompositionSession>, predicate: (id: string) => boolean) {
  const move = enumerateProofMoves(session).find((candidate) => predicate(candidate.id));
  if (move === undefined) throw new Error("expected move was not offered");
  return applyProofMove(session, move.id);
}

function reduceUntilReflexive(session: ReturnType<typeof createMapCompositionSession>) {
  let current = session;
  for (let step = 0; step < 20; step += 1) {
    const close = enumerateProofMoves(current).find((move) => move.kind === "close");
    if (close !== undefined) return applyProofMove(current, close.id);
    const reduce = enumerateProofMoves(current).find((move) => move.kind === "reduce");
    if (reduce !== undefined) {
      current = applyProofMove(current, reduce.id);
      continue;
    }
    const rewrite = enumerateProofMoves(current).find((move) => move.kind === "rewrite");
    if (rewrite !== undefined) {
      current = applyProofMove(current, rewrite.id);
      continue;
    }
    throw new Error(`proof stuck at ${equationToText(current.goals.find((goal) => goal.id === current.focusedGoalId) as EquationGoal)}`);
  }
  throw new Error("proof exceeded the test step limit");
}

describe("visual proof session", () => {
  it("offers every generic structural action on an unknown list", () => {
    const session = createMapCompositionSession();
    expect(enumerateProofMoves(session).filter((move) => move.variable === "l").map((move) => move.kind))
      .toEqual(["induction", "cases", "generalize"]);
    expect(equationToText(session.goals[0] as EquationGoal)).toBe("map (f ∘ g) l = map f (map g l)");
  });

  it("generalizes an accumulator into the induction hypothesis scope", () => {
    let weak = applyProofMove(createLessonSession("list-rev-acc"), "induction:xs");
    while (true) {
      const move = enumerateProofMoves(weak).find((candidate) => candidate.kind === "reduce" || candidate.kind === "rewrite" || candidate.kind === "close");
      if (move === undefined) break;
      weak = applyProofMove(weak, move.id);
    }
    expect(weak.goals.some((goal) => goal.status === "open")).toBe(true);

    let strong = applyProofMove(createLessonSession("list-rev-acc"), "generalize:acc");
    strong = applyProofMove(strong, "induction:xs");
    expect((strong.goals[1] as EquationGoal).hypotheses.find((hypothesis) => hypothesis.name === "IH")?.binders)
      .toEqual([{ name: "acc", type: "List A" }]);
    while (strong.goals.some((goal) => goal.status === "open")) strong = reduceUntilReflexive(strong);
    expect(checkProofSession(strong).theoremTerm).toBeDefined();
  });

  it("proves map composition through local obligations", () => {
    let session = createMapCompositionSession();
    session = applyFirst(session, (id) => id === "induction:l");
    expect(session.goals.map((goal) => goal.label)).toEqual(["empty list", "x :: xs"]);
    expect(session.focusedGoalId).toBe("goal-0");
    expect(equationToText(session.goals[1] as EquationGoal)).toContain("map (f ∘ g) (x :: xs)");
    expect(equationToText(session.goals[1] as EquationGoal)).toContain("map f (map g (x :: xs))");

    session = reduceUntilReflexive(session);
    expect(session.goals[0]?.status).toBe("solved");
    expect(session.focusedGoalId).toBe("goal-1");

    session = reduceUntilReflexive(session);
    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(session.kernelStatus).toBe("pending");
    expect(checkProofSession(session).theoremTerm).toBeDefined();
    expect(session.goals[1]?.steps.some((step) => step.reason === "rewrite with IH")).toBe(true);
  });

  it.each([
    ["bool-involution", "cases:b"],
    ["nat-add-zero", "induction:n"],
    ["list-append-nil", "induction:xs"],
    ["list-map-append", "induction:xs"],
    ["list-rev-append", "induction:xs"],
    ["list-rev-involution", "induction:xs"],
    ["nat-add-succ-right", "induction:n"],
    ["nat-add-assoc", "induction:a"],
    ["nat-add-comm", "induction:a"],
    ["list-length-append", "induction:xs"],
    ["list-length-rev", "induction:xs"],
    ["list-map-length", "induction:xs"],
  ])("completes the %s curriculum lesson", (lessonId, analysisMove) => {
    let session = createLessonSession(lessonId);
    session = applyProofMove(session, analysisMove);
    while (session.goals.some((goal) => goal.status === "open")) session = reduceUntilReflexive(session);
    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(session.kernelStatus).toBe("pending");
    expect(checkProofSession(session).theoremTerm).toBeDefined();
  });

  it.each(["bool-compute", "nat-add-example"])("completes the %s computation lesson", (lessonId) => {
    const session = reduceUntilReflexive(createLessonSession(lessonId));
    expect(session.kernelStatus).toBe("pending");
  });

  it("rejects moves that were not enumerated", () => {
    expect(() => applyProofMove(createMapCompositionSession(), "close:goal-root")).toThrow("illegal proof move");
  });
});
