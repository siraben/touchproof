import type { ProofMove, ProofSession } from "@touchproof/core";

export function proofProgress(session: ProofSession): { solved: number; total: number } {
  return {
    solved: session.goals.filter((goal) => goal.status === "solved").length,
    total: session.goals.length,
  };
}

export function dropMove(moves: readonly ProofMove[], handle: string, target: string): ProofMove | undefined {
  return moves.find((move) => move.handle === handle && move.dropTarget === target);
}

export function movesForHandle(moves: readonly ProofMove[], handle: string): readonly ProofMove[] {
  return moves.filter((move) => move.handle === handle);
}
