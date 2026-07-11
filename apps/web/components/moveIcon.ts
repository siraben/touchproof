import type { ProofMove } from "@touchproof/core";

/** The glyph a move chip shows before its label, keyed by move kind. */
export function moveIcon(move: ProofMove): string {
  if (move.kind === "cases") return "⑂";
  if (move.kind === "induction") return "ℕ";
  if (move.kind === "generalize") return "∀";
  if (move.kind === "rewrite") return "⇢";
  if (move.kind === "close") return "✓";
  if (move.kind === "intro") return "λ";
  if (move.kind === "exact") return "∎";
  if (move.kind === "destruct") return "∧";
  if (move.kind === "split") return "⟨⟩";
  return "↳";
}
