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
    const move = state.moves.find((candidate) => candidate.kind === "cases" || candidate.kind === "induction")
      ?? state.moves.find((candidate) => candidate.kind === "reduce")
      ?? state.moves.find((candidate) => candidate.kind === "rewrite")
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
