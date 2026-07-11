import { describe, expect, it } from "vitest";
import { createMapCompositionSession, enumerateProofMoves } from "@touchproof/core";
import { dropMove, proofProgress } from "../lib/viewModel";

describe("proof workspace view model", () => {
  it("reports local obligation progress", () => {
    expect(proofProgress(createMapCompositionSession())).toEqual({ solved: 0, total: 1 });
  });

  it("resolves only an enumerated drag and drop pair", () => {
    const moves = enumerateProofMoves(createMapCompositionSession());
    const induction = moves.find((move) => move.id === "induction:l")!;
    expect(dropMove(moves, induction.handle, "analysis-zone")?.id).toBe("induction:l");
    expect(dropMove(moves, "var-f", "analysis-zone")).toBeUndefined();
  });
});
