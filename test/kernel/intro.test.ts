import { describe, expect, it } from "vitest";
import { checkProofSession } from "../../src/proof/certificate.js";
import { decodeProofSession } from "../../src/proof/protocol.js";
import {
  applyProofMove,
  createLessonSession,
  enumerateProofMoves,
  type ProofSession,
} from "../../src/proof/session.js";

function solveRemaining(session: ProofSession): ProofSession {
  let current = session;
  for (let step = 0; step < 64 && current.goals.some((goal) => goal.status === "open"); step += 1) {
    const moves = enumerateProofMoves(current);
    const move = moves.find((candidate) => candidate.kind === "close")
      ?? moves.find((candidate) => candidate.kind === "reduce")
      ?? moves.find((candidate) => candidate.kind === "rewrite");
    if (move === undefined) throw new Error("solver became stuck");
    current = applyProofMove(current, move.id);
  }
  return current;
}

describe("intro on generalized variables", () => {
  it("is generalize's state-derived inverse", () => {
    let session = createLessonSession("list-rev-acc");
    expect(enumerateProofMoves(session).some((move) => move.kind === "intro")).toBe(false);

    session = applyProofMove(session, "generalize:acc");
    expect(session.generalizedVariables).toEqual(["acc"]);
    const moves = enumerateProofMoves(session);
    expect(moves.some((move) => move.id === "generalize:acc")).toBe(false);
    const intro = moves.find((move) => move.kind === "intro");
    expect(intro?.id).toBe("intro:acc");
    expect(intro?.variable).toBe("acc");

    session = applyProofMove(session, "intro:acc");
    expect(session.generalizedVariables).toEqual([]);
    const after = enumerateProofMoves(session);
    expect(after.some((move) => move.kind === "intro")).toBe(false);
    // The full move set is back to the pre-generalize state.
    expect(after.some((move) => move.id === "generalize:acc")).toBe(true);
    expect(after.map((move) => move.id)).toEqual(enumerateProofMoves(createLessonSession("list-rev-acc")).map((move) => move.id));
  });

  it("pops only the outermost ∀-binder, so chains unwind front to back", () => {
    let session = createLessonSession("nat-add-succ-right");
    session = applyProofMove(session, "generalize:n");
    session = applyProofMove(session, "generalize:m");
    expect(session.generalizedVariables).toEqual(["n", "m"]);
    expect(enumerateProofMoves(session).filter((move) => move.kind === "intro").map((move) => move.id)).toEqual(["intro:n"]);
    expect(() => applyProofMove(session, "intro:m")).toThrow("illegal proof move");

    session = applyProofMove(session, "intro:n");
    expect(session.generalizedVariables).toEqual(["m"]);
    session = applyProofMove(session, "intro:m");
    expect(session.generalizedVariables).toEqual([]);
  });

  it("composes with the certificate: generalize, intro, re-generalize, complete, kernel-check", () => {
    let session = createLessonSession("list-rev-acc");
    session = applyProofMove(session, "generalize:acc");
    session = applyProofMove(session, "intro:acc");
    session = applyProofMove(session, "generalize:acc");
    session = applyProofMove(session, "induction:xs");
    session = solveRemaining(session);
    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(checkProofSession(session).theoremTerm).toBeDefined();
  });

  it("replays intro'd states through protocol v2", () => {
    let session = createLessonSession("nat-add-succ-right");
    session = applyProofMove(session, "generalize:n");
    session = applyProofMove(session, "generalize:m");
    session = applyProofMove(session, "intro:n");
    const decoded = decodeProofSession(structuredClone(session));
    expect(decoded.generalizedVariables).toEqual(["m"]);
    expect(enumerateProofMoves(decoded).map((move) => move.id)).toEqual(enumerateProofMoves(session).map((move) => move.id));

    // A full derivation that used generalize → intro → generalize survives
    // the round trip and still assembles its certificate.
    let acc = createLessonSession("list-rev-acc");
    acc = applyProofMove(acc, "generalize:acc");
    acc = applyProofMove(acc, "intro:acc");
    acc = applyProofMove(acc, "generalize:acc");
    acc = applyProofMove(acc, "induction:xs");
    acc = solveRemaining(acc);
    expect(checkProofSession(decodeProofSession(structuredClone(acc))).theoremTerm).toBeDefined();
  });
});
