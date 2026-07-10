import { describe, expect, it } from "vitest";
import {
  applyProofMove,
  createMapCompositionSession,
  enumerateProofMoves,
  equationToText,
} from "../../src/proof/session.js";

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
    throw new Error(`proof stuck at ${equationToText(current.goals.find((goal) => goal.id === current.focusedGoalId)!)}`);
  }
  throw new Error("proof exceeded the test step limit");
}

describe("visual proof session", () => {
  it("offers only induction before an unknown list can reduce", () => {
    const session = createMapCompositionSession();
    expect(enumerateProofMoves(session).map((move) => move.kind)).toEqual(["induction"]);
  });

  it("proves map composition through local obligations", () => {
    let session = createMapCompositionSession();
    session = applyFirst(session, (id) => id === "induction:l");
    expect(session.goals.map((goal) => goal.label)).toEqual(["empty list", "x :: xs"]);
    expect(session.focusedGoalId).toBe("goal-nil");

    session = reduceUntilReflexive(session);
    expect(session.goals[0]?.status).toBe("solved");
    expect(session.focusedGoalId).toBe("goal-cons");

    session = reduceUntilReflexive(session);
    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(session.kernelStatus).toBe("checked");
    expect(session.goals[1]?.steps.some((step) => step.reason === "rewrite with IH")).toBe(true);
  });

  it("rejects moves that were not enumerated", () => {
    expect(() => applyProofMove(createMapCompositionSession(), "close:goal-root")).toThrow("illegal proof move");
  });
});
