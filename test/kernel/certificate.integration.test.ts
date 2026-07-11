import { describe, expect, it } from "vitest";
import { checkProofSession } from "../../src/proof/certificate.js";
import { applyProofMove, createLessonSession, enumerateProofMoves, lessonCatalog, type ProofSession } from "../../src/proof/session.js";

function finish(lessonId: string): ProofSession {
  let session = createLessonSession(lessonId);
  if (lessonId === "list-rev-acc") session = applyProofMove(session, "generalize:acc");
  for (let count = 0; count < 100 && session.goals.some((goal) => goal.status === "open"); count += 1) {
    const moves = enumerateProofMoves(session);
    const move = moves.find((candidate) => candidate.kind === "induction")
      ?? moves.find((candidate) => candidate.kind === "cases")
      ?? moves.find((candidate) => candidate.kind === "reduce")
      ?? moves.find((candidate) => candidate.kind === "rewrite")
      ?? moves.find((candidate) => candidate.kind === "close");
    if (move === undefined) throw new Error(`${lessonId} became stuck`);
    session = applyProofMove(session, move.id);
  }
  return session;
}

describe("exact visual proof certificates", () => {
  it.each(lessonCatalog.map((lesson) => [lesson.id] as const))("assembles and checks the exact %s derivation", (lessonId) => {
    const certificate = checkProofSession(finish(lessonId));
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.theoremType).toBeDefined();
    expect(certificate.script).not.toContain("sorry");
  });

  it("rejects a mutated visible transition", () => {
    const completed = finish("bool-compute");
    const forged = structuredClone(completed);
    const goal = forged.goals[0]!;
    const step = goal.steps[1]!;
    (step.right as { name: string }).name = "false";
    expect(() => checkProofSession(forged)).toThrow();
  });
});
