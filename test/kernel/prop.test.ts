import { describe, expect, it } from "vitest";
import { checkProofSession } from "../../src/proof/certificate.js";
import { decodeProofSession } from "../../src/proof/protocol.js";
import { verifyLessonProof } from "../../src/proof/standardLibrary.js";
import {
  applyProofMove,
  createLessonSession,
  enumerateProofMoves,
  exprToText,
  isPropositionGoal,
  type ProofSession,
  type PropositionGoal,
} from "../../src/proof/session.js";

function focusedProposition(session: ProofSession): PropositionGoal {
  const goal = session.goals.find((candidate) => candidate.id === session.focusedGoalId);
  if (goal === undefined || !isPropositionGoal(goal)) throw new Error("expected a focused proposition goal");
  return goal;
}

function applyKind(session: ProofSession, kind: string): ProofSession {
  const move = enumerateProofMoves(session).find((candidate) => candidate.kind === kind);
  if (move === undefined) throw new Error(`no ${kind} move offered`);
  return applyProofMove(session, move.id);
}

describe("propositional lessons", () => {
  it("proves P → P by intro and exact", () => {
    let session = createLessonSession("prop-identity");
    const root = focusedProposition(session);
    expect(exprToText(root.proposition)).toBe("P → P");
    expect(enumerateProofMoves(session).map((move) => move.kind)).toEqual(["intro"]);

    session = applyProofMove(session, "intro");
    const goal = focusedProposition(session);
    expect(exprToText(goal.proposition)).toBe("P");
    expect(goal.hypotheses.map((hypothesis) => [hypothesis.name, exprToText(hypothesis.proposition)])).toEqual([["H", "P"]]);

    const exact = enumerateProofMoves(session).find((move) => move.kind === "exact");
    expect(exact?.id).toBe("exact:hyp-H");
    session = applyProofMove(session, exact!.id);
    expect(session.goals.every((candidate) => candidate.status === "solved")).toBe(true);

    const certificate = checkProofSession(session);
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.script).toContain("λ");
    expect(certificate.script).toContain("Π P : Type 0");
  });

  it("proves P ∧ Q → P by intro, destruct, exact", () => {
    let session = createLessonSession("prop-and-left");
    session = applyProofMove(session, "intro");
    expect(enumerateProofMoves(session).map((move) => move.id)).toEqual(["destruct:hyp-H"]);

    session = applyProofMove(session, "destruct:hyp-H");
    // destruct is a SINGLE-branch analysis: the goal tree splits without forking.
    expect(session.ancestors.map((candidate) => candidate.id)).toEqual(["goal-root"]);
    expect(session.goals.map((candidate) => candidate.id)).toEqual(["goal-0"]);
    const ancestorAnalysis = session.ancestors[0]!;
    expect(isPropositionGoal(ancestorAnalysis) && ancestorAnalysis.analysis?.kind).toBe("destruct");
    const goal = focusedProposition(session);
    expect(goal.hypotheses.map((hypothesis) => [hypothesis.name, exprToText(hypothesis.proposition)]))
      .toEqual([["HA", "P"], ["HB", "Q"]]);
    expect(exprToText(goal.proposition)).toBe("P");

    session = applyProofMove(session, "exact:hyp-HA");
    expect(session.goals.every((candidate) => candidate.status === "solved")).toBe(true);
    // The single-branch ancestor is marked solved by the derived state pass.
    expect(session.ancestors.every((candidate) => candidate.status === "solved")).toBe(true);

    const certificate = checkProofSession(session);
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.script).toContain("and.rec");
  });

  it("proves P → Q → P with nested intros and a choice of hypothesis", () => {
    let session = createLessonSession("prop-const");
    session = applyProofMove(session, "intro");
    expect(exprToText(focusedProposition(session).proposition)).toBe("Q → P");
    session = applyProofMove(session, "intro");
    const goal = focusedProposition(session);
    // Fresh naming: the second intro cannot reuse H.
    expect(goal.hypotheses.map((hypothesis) => hypothesis.name)).toEqual(["H", "H2"]);
    // Only the hypothesis whose proposition IS the goal closes it.
    const exacts = enumerateProofMoves(session).filter((move) => move.kind === "exact");
    expect(exacts.map((move) => move.id)).toEqual(["exact:hyp-H"]);
    session = applyProofMove(session, "exact:hyp-H");
    expect(checkProofSession(session).theoremTerm).toBeDefined();
  });

  it("proves the capstone P ∧ Q → Q ∧ P via intro, destruct, split, exact, exact", () => {
    let session = createLessonSession("prop-and-swap");
    session = applyProofMove(session, "intro");
    session = applyProofMove(session, "destruct:hyp-H");
    const beforeSplit = focusedProposition(session);
    expect(exprToText(beforeSplit.proposition)).toBe("Q ∧ P");
    expect(enumerateProofMoves(session).some((move) => move.kind === "split")).toBe(true);

    session = applyKind(session, "split");
    expect(session.goals.map((candidate) => candidate.id)).toEqual(["goal-0.0", "goal-0.1"]);
    expect(session.goals.map((candidate) => isPropositionGoal(candidate) ? exprToText(candidate.proposition) : ""))
      .toEqual(["Q", "P"]);
    expect(session.focusedGoalId).toBe("goal-0.0");
    // Both split children inherit the destructed hypotheses.
    expect(focusedProposition(session).hypotheses.map((hypothesis) => hypothesis.name)).toEqual(["HA", "HB"]);

    session = applyProofMove(session, "exact:hyp-HB");
    expect(session.focusedGoalId).toBe("goal-0.1");
    session = applyProofMove(session, "exact:hyp-HA");
    expect(session.goals.every((candidate) => candidate.status === "solved")).toBe(true);
    expect(session.ancestors.every((candidate) => candidate.status === "solved")).toBe(true);

    const certificate = checkProofSession(session);
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.script).toContain("conj");
    expect(certificate.script).not.toContain("sorry");
  });

  it.each([
    ["prop-identity"],
    ["prop-and-left"],
    ["prop-const"],
    ["prop-and-swap"],
  ])("verifies the hand-assembled %s certificate against the kernel", (lessonId) => {
    expect(() => verifyLessonProof(lessonId)).not.toThrow();
  });

  it("keeps illegal propositional moves impossible", () => {
    const session = createLessonSession("prop-identity");
    // No conjunction anywhere: neither split nor destruct is enumerated.
    expect(enumerateProofMoves(session).map((move) => move.kind)).toEqual(["intro"]);
    expect(() => applyProofMove(session, "split")).toThrow("illegal proof move");
    expect(() => applyProofMove(session, "exact:hyp-H")).toThrow("illegal proof move");
    // An atomic goal with no matching hypothesis offers nothing to close with.
    const stuck = applyProofMove(createLessonSession("prop-and-swap"), "intro");
    expect(enumerateProofMoves(stuck).some((move) => move.kind === "exact")).toBe(false);
  });
});

describe("propositional protocol replay", () => {
  function completeAndSwap(): ProofSession {
    let session = createLessonSession("prop-and-swap");
    session = applyProofMove(session, "intro");
    session = applyProofMove(session, "destruct:hyp-H");
    session = applyKind(session, "split");
    session = applyProofMove(session, "exact:hyp-HB");
    session = applyProofMove(session, "exact:hyp-HA");
    return session;
  }

  it("replays a completed propositional session and still certifies it", () => {
    const session = completeAndSwap();
    const decoded = decodeProofSession(structuredClone(session));
    expect(decoded.goals.map((goal) => goal.id)).toEqual(session.goals.map((goal) => goal.id));
    expect(decoded.ancestors.map((goal) => goal.id)).toEqual(["goal-root", "goal-0"]);
    expect(decoded.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(decoded.kernelStatus).toBe("pending");
    expect(checkProofSession(decoded).theoremTerm).toBeDefined();
  });

  it("replays a mid-proof propositional session and offers the same moves", () => {
    let session = createLessonSession("prop-and-swap");
    session = applyProofMove(session, "intro");
    session = applyProofMove(session, "destruct:hyp-H");
    const decoded = decodeProofSession(structuredClone(session));
    expect(decoded.focusedGoalId).toBe(session.focusedGoalId);
    expect(focusedProposition(decoded).hypotheses.map((hypothesis) => hypothesis.name)).toEqual(["HA", "HB"]);
    expect(enumerateProofMoves(decoded).map((move) => move.id)).toEqual(enumerateProofMoves(session).map((move) => move.id));
  });

  it("re-derives hypotheses and intro names instead of trusting the payload", () => {
    const forged = structuredClone(completeAndSwap()) as unknown as {
      goals: { hypotheses: { name: string; proposition: unknown }[] }[];
    };
    // Renaming a replayed hypothesis has no effect: the decode reconstructs it.
    forged.goals[0]!.hypotheses[0]!.name = "Sneaky";
    const decoded = decodeProofSession(forged);
    const goal = decoded.goals[0]!;
    expect(isPropositionGoal(goal) && goal.hypotheses.map((hypothesis) => hypothesis.name)).toEqual(["HA", "HB"]);
  });

  it("rejects forged propositional histories", () => {
    // A solved goal that never closed with exact.
    const unsolved = structuredClone(createLessonSession("prop-identity")) as unknown as { goals: { status: string }[] };
    unsolved.goals[0]!.status = "solved";
    expect(() => decodeProofSession(unsolved)).toThrow();

    // A mutated final proposition no longer matches its history.
    const mutated = structuredClone(completeAndSwap()) as unknown as {
      goals: { proposition: { name: string }; steps: { proposition: { name: string } }[] }[];
    };
    mutated.goals[0]!.proposition.name = "P";
    expect(() => decodeProofSession(mutated)).toThrow();

    // A transition that no enumerated move produces.
    const jumped = structuredClone(applyProofMove(createLessonSession("prop-const"), "intro")) as unknown as {
      goals: { steps: { proposition: unknown }[] }[];
    };
    jumped.goals[0]!.steps[1]!.proposition = { id: "forged", kind: "var", name: "Q" };
    expect(() => decodeProofSession(jumped)).toThrow();

    // Program calls are not propositions.
    const smuggled = structuredClone(createLessonSession("prop-identity")) as unknown as {
      goals: { proposition: unknown; steps: { proposition: unknown }[] }[];
    };
    const call = { id: "bad", kind: "call", name: "add", args: [{ id: "bad-1", kind: "var", name: "P" }, { id: "bad-2", kind: "var", name: "P" }] };
    smuggled.goals[0]!.proposition = call;
    smuggled.goals[0]!.steps[0]!.proposition = call;
    expect(() => decodeProofSession(smuggled)).toThrow("invalid proof state");
  });
});
