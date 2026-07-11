import { describe, expect, it } from "vitest";
import { checkProofSession } from "../../src/proof/certificate.js";
import { decodeProofSession } from "../../src/proof/protocol.js";
import {
  applyProofMove,
  createLessonSession,
  enumerateProofMoves,
  exprToText,
  focusGoal,
  type ProofSession,
} from "../../src/proof/session.js";

function applyKind(session: ProofSession, kind: string): ProofSession {
  const move = enumerateProofMoves(session).find((candidate) => candidate.kind === kind);
  if (move === undefined) throw new Error(`no ${kind} move offered`);
  return applyProofMove(session, move.id);
}

/** Solves the CURRENT goal (and any that focus advances to) with computation-level moves only. */
function grind(session: ProofSession, limit = 64): ProofSession {
  let current = session;
  for (let step = 0; step < limit; step += 1) {
    if (current.goals.every((goal) => goal.status === "solved")) return current;
    const moves = enumerateProofMoves(current);
    const move = moves.find((candidate) => candidate.kind === "close")
      ?? moves.find((candidate) => candidate.kind === "reduce")
      ?? moves.find((candidate) => candidate.kind === "rewrite");
    if (move === undefined) throw new Error("grind became stuck");
    current = applyProofMove(current, move.id);
  }
  throw new Error("grind exceeded its step limit");
}

/** Solves only the focused goal, then stops when focus moves on. */
function grindFocused(session: ProofSession): ProofSession {
  const focused = session.focusedGoalId;
  let current = session;
  for (let step = 0; step < 64; step += 1) {
    if (current.focusedGoalId !== focused || current.goals.every((goal) => goal.status === "solved")) return current;
    const moves = enumerateProofMoves(current);
    const move = moves.find((candidate) => candidate.kind === "close")
      ?? moves.find((candidate) => candidate.kind === "reduce")
      ?? moves.find((candidate) => candidate.kind === "rewrite");
    if (move === undefined) throw new Error("grind became stuck");
    current = applyProofMove(current, move.id);
  }
  throw new Error("grind exceeded its step limit");
}

describe("nested, state-derived analyses", () => {
  it("permits an unnecessary-but-legal case analysis inside an induction branch and still certifies", () => {
    let session = createLessonSession("nat-add-succ-right");
    session = applyProofMove(session, "induction:n");
    expect(session.focusedGoalId).toBe("goal-0");
    // The zero branch still owns m : Nat, so a second analysis is offered.
    expect(enumerateProofMoves(session).some((move) => move.id === "cases:m")).toBe(true);
    session = applyProofMove(session, "cases:m");
    expect(session.goals.map((goal) => goal.id)).toEqual(["goal-0.0", "goal-0.1", "goal-1"]);
    expect(session.goals.map((goal) => goal.label)).toEqual(["0 · 0", "0 · S n", "S n"]);
    expect(session.goals[0]?.parentId).toBe("goal-0");
    expect(session.ancestors.map((goal) => goal.id)).toEqual(["goal-root", "goal-0"]);

    session = grind(session);
    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(session.ancestors.every((goal) => goal.status === "solved")).toBe(true);
    const certificate = checkProofSession(session);
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.script).not.toContain("sorry");
  });

  it("permits repeated case analyses on the successively remaining variable", () => {
    let session = createLessonSession("nat-add-succ-right");
    session = applyProofMove(session, "induction:n");
    session = applyProofMove(session, "cases:m"); // focused: goal-0.0
    session = grindFocused(session); // solves 0 · 0, focus moves to goal-0.1
    expect(session.focusedGoalId).toBe("goal-0.1");
    // ... and cases again on the freshly introduced predecessor.
    session = applyProofMove(session, "cases:n");
    expect(session.goals.map((goal) => goal.label)).toEqual(["0 · 0", "0 · S n · 0", "0 · S n · S n", "S n"]);
    expect(session.goals[1]?.parentId).toBe("goal-0.1");

    session = grind(session);
    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(checkProofSession(session).theoremTerm).toBeDefined();
  });

  it("proves add_comm with nested case analyses that instantiate the inherited hypotheses", () => {
    let session = createLessonSession("nat-add-comm");
    session = applyProofMove(session, "induction:a");

    // Base branch: 0 + b = b + 0. Reduce, then case-analyze b INSIDE the
    // branch. The branch lemma add_zero_right mentions b, so induction on b
    // is (correctly) not offered — case analysis is, and instantiates it.
    expect(session.focusedGoalId).toBe("goal-0");
    session = applyKind(session, "reduce"); // b = b + 0
    expect(enumerateProofMoves(session).some((move) => move.id === "induction:b")).toBe(false);
    session = applyProofMove(session, "cases:b");
    // 0 · 0 with the instantiated lemma 0 + 0 = 0.
    session = grindFocused(session);
    // 0 · S n: S n = S n + 0; the INSTANTIATED lemma S n + 0 = S n closes it.
    expect(session.focusedGoalId).toBe("goal-0.1");
    session = applyKind(session, "rewrite");
    session = applyKind(session, "close");

    // Successor branch: S n + b = b + S n with IH : n + b = b + n.
    expect(session.focusedGoalId).toBe("goal-1");
    session = applyKind(session, "reduce"); // S (n + b) = b + S n
    const ihRewrite = enumerateProofMoves(session).find((move) => move.kind === "rewrite" && move.hypothesisId === "ih-n");
    expect(ihRewrite).toBeDefined();
    session = applyProofMove(session, ihRewrite!.id); // S (b + n) = b + S n
    session = applyProofMove(session, "cases:b");

    // Fields freshen away from the instantiated hypotheses (n stays visible),
    // and BOTH inherited hypotheses received this branch's pattern b := S n2:
    // the outer IH and the configured add_succ_right lemma.
    const inner = session.goals.find((goal) => goal.id === "goal-1.1");
    expect(inner?.label).toBe("S n · S n2");
    expect(inner?.context).toContain("n2 : Nat");
    expect(inner?.context).not.toContain("b : Nat");
    const innerIH = inner?.hypotheses.find((hypothesis) => hypothesis.id === "ih-n");
    expect(innerIH && `${exprToText(innerIH.left)} = ${exprToText(innerIH.right)}`).toBe("n + S n2 = S n2 + n");
    const innerLemma = inner?.hypotheses.find((hypothesis) => hypothesis.name === "add_succ_right");
    expect(innerLemma && `${exprToText(innerLemma.left)} = ${exprToText(innerLemma.right)}`).toBe("S n2 + S n = S (S n2 + n)");

    // S n · 0 solves by pure computation.
    session = grindFocused(session);
    // S n · S n2: the instantiated lemma turns the right side into the left.
    expect(session.focusedGoalId).toBe("goal-1.1");
    const lemmaRewrite = enumerateProofMoves(session).find((move) => move.kind === "rewrite" && move.hypothesisId === "lemma-add-succ-right");
    expect(lemmaRewrite).toBeDefined();
    session = applyProofMove(session, lemmaRewrite!.id); // S (S n2 + n) = S (S n2 + n)
    session = applyKind(session, "close");

    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    const certificate = checkProofSession(session);
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.theoremType).toBeDefined();
  });

  it("instantiates the IH when case-analyzing the same variable inside an induction branch", () => {
    // The browser repro: nat-add-zero, induct on n, then CASES on n inside
    // the S branch. The IH must become the instantiated equation per branch —
    // un-instantiated, the S n2 branch is a mathematical dead end.
    let session = createLessonSession("nat-add-zero");
    session = applyProofMove(session, "induction:n");
    session = focusGoal(session, "goal-1"); // S n + 0 = S n, IH : n + 0 = n
    session = applyProofMove(session, "cases:n");

    expect(session.goals.map((goal) => goal.label)).toEqual(["0", "S n · 0", "S n · S n2"]);
    const zeroIH = session.goals.find((goal) => goal.id === "goal-1.0")?.hypotheses.find((hypothesis) => hypothesis.id === "ih-n");
    const succIH = session.goals.find((goal) => goal.id === "goal-1.1")?.hypotheses.find((hypothesis) => hypothesis.id === "ih-n");
    expect(zeroIH && `${exprToText(zeroIH.left)} = ${exprToText(zeroIH.right)}`).toBe("0 + 0 = 0");
    expect(succIH && `${exprToText(succIH.left)} = ${exprToText(succIH.right)}`).toBe("S n2 + 0 = S n2");

    // S n2 branch: S (S n2) + 0 = S (S n2) — one reduce, then the
    // INSTANTIATED IH closes it.
    session = focusGoal(session, "goal-1.1");
    session = applyKind(session, "reduce"); // S (S n2 + 0) = S (S n2)
    const rewrite = enumerateProofMoves(session).find((move) => move.kind === "rewrite" && move.hypothesisId === "ih-n");
    expect(rewrite).toBeDefined();
    session = applyProofMove(session, rewrite!.id); // S (S n2) = S (S n2)
    session = applyKind(session, "close");

    session = grind(session); // remaining: goal-0 and S n · 0
    expect(session.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(session.ancestors.every((goal) => goal.status === "solved")).toBe(true);
    const certificate = checkProofSession(session);
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.script).not.toContain("sorry");
  });

  it("offers cases but not induction on variables mentioned by hypotheses", () => {
    let session = createLessonSession("nat-add-zero");
    session = applyProofMove(session, "induction:n");
    session = focusGoal(session, "goal-1"); // IH : n + 0 = n mentions n
    const moves = enumerateProofMoves(session);
    expect(moves.some((move) => move.id === "induction:n")).toBe(false);
    expect(moves.some((move) => move.id === "cases:n")).toBe(true);
    expect(moves.some((move) => move.id === "generalize:n")).toBe(true);
    // A generalized IH binds its own variable — that never blocks analyses
    // on it (∀-bound occurrences are not free mentions).
    let acc = createLessonSession("list-rev-acc");
    acc = applyProofMove(acc, "generalize:acc");
    acc = applyProofMove(acc, "induction:xs");
    acc = focusGoal(acc, "goal-1");
    expect(enumerateProofMoves(acc).some((move) => move.id === "cases:acc")).toBe(true);
  });

  it("round-trips a nested session through the protocol and keeps forgeries out", () => {
    let session = createLessonSession("nat-add-succ-right");
    session = applyProofMove(session, "induction:n");
    session = applyProofMove(session, "cases:m");
    session = grind(session);

    const decoded = decodeProofSession(structuredClone(session));
    expect(decoded.goals.map((goal) => goal.id)).toEqual(session.goals.map((goal) => goal.id));
    expect(decoded.ancestors.map((goal) => goal.id)).toEqual(["goal-root", "goal-0"]);
    expect(decoded.goals.every((goal) => goal.status === "solved")).toBe(true);
    expect(decoded.kernelStatus).toBe("pending");

    // A mutated transition inside a NESTED obligation is rejected.
    const forgedStep = structuredClone(session) as unknown as { goals: { steps: { left: { name: string } }[] }[] };
    forgedStep.goals[0]!.steps[0]!.left.name = "append";
    expect(() => decodeProofSession(forgedStep)).toThrow();

    // A forged analysis on a variable that does not occur is rejected.
    const forgedAnalysis = structuredClone(session) as unknown as { ancestors: { analysis: { variable: string } }[] };
    forgedAnalysis.ancestors[1]!.analysis.variable = "nonexistent";
    expect(() => decodeProofSession(forgedAnalysis)).toThrow();
  });

  it("keeps analyses out of solved goals and unsplittable positions", () => {
    let session = createLessonSession("nat-add-succ-right");
    session = applyProofMove(session, "induction:n");
    session = applyProofMove(session, "cases:m");
    session = grindFocused(session);
    // goal-0.0 is solved; focusing it offers nothing.
    const solvedFocus = { ...session, focusedGoalId: "goal-0.0" };
    expect(enumerateProofMoves(solvedFocus)).toEqual([]);
    // Splitting an already-split goal is impossible: it is not a leaf.
    expect(session.goals.some((goal) => goal.id === "goal-0")).toBe(false);
  });
});
