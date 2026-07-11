import { describe, expect, it } from "vitest";
import { checkProofSession } from "@touchproof/core";
import {
  BrowserProofBackend,
  type KernelPort,
  type ProofSnapshot,
} from "../lib/proof/browserProofBackend";

class CountingKernel implements KernelPort {
  calls = 0;

  check(value: unknown) {
    this.calls += 1;
    return checkProofSession(value);
  }
}

async function finishLesson(backend: BrowserProofBackend, lessonId: string, limit = 100): Promise<ProofSnapshot> {
  let state = await backend.startLesson(lessonId);
  for (let index = 0; index < limit && state.session.goals.some((goal) => goal.status === "open"); index += 1) {
    // General mode offers analysis moves on every goal, repeatedly; the greedy
    // driver only takes one before the first split or it would recurse forever.
    const unsplit = state.session.ancestors.length === 0;
    // Propositional preferences: intro peels implications, exact closes as soon
    // as a hypothesis matches, destruct unpacks a ∧ hypothesis before split
    // divides the goal (destruct and split each consume their site, so unlike
    // cases/induction they cannot re-offer forever).
    const move = (unsplit ? state.moves.find((candidate) => candidate.kind === "cases" || candidate.kind === "induction") : undefined)
      ?? state.moves.find((candidate) => candidate.kind === "intro")
      ?? state.moves.find((candidate) => candidate.kind === "reduce")
      ?? state.moves.find((candidate) => candidate.kind === "rewrite")
      ?? state.moves.find((candidate) => candidate.kind === "exact")
      ?? state.moves.find((candidate) => candidate.kind === "destruct")
      ?? state.moves.find((candidate) => candidate.kind === "split")
      ?? state.moves.find((candidate) => candidate.kind === "close");
    if (move === undefined) throw new Error("proof became stuck");
    state = await backend.dispatch(state.session, { kind: "apply-move", moveId: move.id });
  }
  return state;
}

describe("browser dependent proof backend", () => {
  it("checks a visual proof before certifying it", async () => {
    const kernel = new CountingKernel();
    const state = await finishLesson(new BrowserProofBackend(kernel), "bool-compute");
    expect(state.session.kernelStatus).toBe("checked");
    expect(state.evidence.scope).toBe("completed-theorem");
    expect(state.kernelVersion).toBe("TouchProof DTT 0.1");
    expect(state.script).toContain("eq_trans");
    expect(state.script).not.toContain("sorry");
    expect(kernel.calls).toBe(3);
  });

  it("checks polymorphic induction and IH rewriting", async () => {
    const state = await finishLesson(new BrowserProofBackend(), "map-composition");
    expect(state.session.kernelStatus).toBe("checked");
    expect(state.session.theoremContext).toContain("f : B → C");
    expect(state.session.goals.some((goal) => goal.steps.some((step) => step.reason === "rewrite with IH"))).toBe(true);
  });

  it("completes every propositional lesson with intro/exact/destruct/split", async () => {
    const backend = new BrowserProofBackend();
    for (const lessonId of ["prop-identity", "prop-and-left", "prop-const", "prop-and-swap"]) {
      const state = await finishLesson(backend, lessonId);
      expect(state.session.kernelStatus).toBe("checked");
      expect(state.evidence.scope).toBe("completed-theorem");
      expect(state.script).not.toContain("sorry");
      // The assembled certificate is a λ-term over the propositional atoms.
      expect(state.script).toContain("λ");
    }
  });

  it("records intro and exact steps on the and-left walkthrough", async () => {
    const state = await finishLesson(new BrowserProofBackend(), "prop-and-left");
    // The intro happened before the destruct split, so it lives on the ancestor;
    // the exact closed the leaf obligation.
    const reasons = [...state.session.ancestors, ...state.session.goals].flatMap((goal) => goal.steps.map((step) => step.reason));
    expect(reasons.some((reason) => reason.startsWith("intro "))).toBe(true);
    expect(reasons.some((reason) => reason.startsWith("exact "))).toBe(true);
  });

  it("never trusts a persisted checked status", async () => {
    const backend = new BrowserProofBackend();
    const initial = await backend.startLesson("bool-involution");
    const forged = { ...initial.session, kernelStatus: "checked" };
    const restored = await backend.restore(forged);
    expect(restored.session.kernelStatus).toBe("pending");
    expect(restored.evidence.scope).toBe("transitions");
  });

  it("rejects injected syntax before checking", async () => {
    const kernel = new CountingKernel();
    const backend = new BrowserProofBackend(kernel);
    const initial = await backend.startLesson("bool-compute");
    const forged = structuredClone(initial.session) as unknown as { goals: { left: { name: string } }[] };
    forged.goals[0]!.left.name = "negb)\n#eval IO.getEnv_SECRET";
    await expect(backend.restore(forged)).rejects.toThrow("invalid proof state");
    expect(kernel.calls).toBe(1);
  });
});
