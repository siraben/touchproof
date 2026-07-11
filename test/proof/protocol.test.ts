import { describe, expect, it } from "vitest";
import { decodeProofSession } from "../../src/proof/protocol.js";
import { createLessonSession } from "../../src/proof/session.js";

describe("proof protocol", () => {
  it("never trusts a client-supplied checked status", () => {
    const forged = { ...createLessonSession("bool-involution"), kernelStatus: "checked" };
    expect(decodeProofSession(forged).kernelStatus).toBe("pending");
  });

  it("restores immutable theorem metadata from the trusted catalog", () => {
    const forged = { ...createLessonSession("bool-compute"), theorem: "false_theorem", statement: "false = true" };
    const decoded = decodeProofSession(forged);
    expect(decoded.theorem).toBe("negb_false");
    expect(decoded.statement).toBe("negb false = true");
  });

  it("rejects malformed nested expressions", () => {
    const session = structuredClone(createLessonSession("bool-compute")) as unknown as Record<string, unknown>;
    const goals = session["goals"] as { left: unknown }[];
    goals[0]!.left = { id: "bad", kind: "call", name: "negb", args: "not an array" };
    expect(() => decodeProofSession(session)).toThrow("invalid proof state");
  });

  it("rejects source injection in expression symbols", () => {
    const session = structuredClone(createLessonSession("bool-compute")) as unknown as Record<string, unknown>;
    const goals = session["goals"] as { left: { name: string } }[];
    goals[0]!.left.name = "negb)\n#eval IO.getEnv_SECRET";
    expect(() => decodeProofSession(session)).toThrow("invalid proof state");
  });

  it("reconstructs executable metadata and notebook equations at the trust boundary", () => {
    const session = structuredClone(createLessonSession("bool-involution")) as unknown as Record<string, unknown>;
    const goals = session["goals"] as { context: string[]; type: string; steps: { equation: string; reason: string }[] }[];
    goals[0]!.context = ["x : Bool) : True := by trivial\n#eval IO.getEnv \"SECRET\""];
    goals[0]!.type = "True := by trivial\n#eval IO.getEnv \"SECRET\"";
    goals[0]!.steps[0]!.equation = "false = true";
    goals[0]!.steps[0]!.reason = "rewrite with ]\n#eval IO.getEnv \"SECRET\"";
    const decoded = decodeProofSession(session);
    expect(decoded.goals[0]!.context).toEqual(["b : Bool"]);
    expect(decoded.goals[0]!.type).toBe("Bool");
    expect(decoded.goals[0]!.steps[0]!.equation).toBe("negb (negb b) = b");
    expect(decoded.goals[0]!.steps[0]!.reason).toBe("theorem statement");
  });
});
