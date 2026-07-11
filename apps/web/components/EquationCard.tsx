"use client";

import type { ProgramExpr, ProofMove } from "@touchproof/core";
import { Expression } from "./Expression";

export function ScopeBox({ variables, children }: { variables: readonly string[]; children: React.ReactNode }) {
  return variables.reduceRight<React.ReactNode>((content, variable) => (
    <div className="scope-box" key={variable}>
      <div className="scope-label">∀ {variable}<span>scope</span></div>
      {content}
    </div>
  ), children);
}

/** The hero sheet: the current obligation's left = right, with the reflexivity
 * close button glued to the RHS and the one-shot Q.E.D. stamp on completion. */
export function EquationCard({
  left,
  right,
  moves,
  closeMove,
  busy,
  solved,
  generalizedVariables,
  onMove,
}: {
  left: ProgramExpr;
  right: ProgramExpr;
  moves: readonly ProofMove[];
  closeMove: ProofMove | undefined;
  busy: boolean;
  solved: boolean;
  generalizedVariables: readonly string[];
  onMove: (moveId: string) => void;
}) {
  return (
    <ScopeBox variables={generalizedVariables}>
      <div className={`equation-card ${busy ? "busy" : ""}`} onClick={(event) => event.stopPropagation()}>
        <Expression expression={left} moves={moves} onMove={onMove} />
        {/* The = stays glued to the start of the RHS: when the card is too
            narrow for one line, this whole group wraps as the second line. */}
        <span className="equation-rhs">
          <button
            className={`equals ${closeMove === undefined ? "" : "closable"}`}
            disabled={closeMove === undefined || busy}
            title={closeMove === undefined ? "Keep transforming until both sides match" : "Close by reflexivity"}
            onClick={() => closeMove !== undefined && onMove(closeMove.id)}
          >=</button>
          <Expression expression={right} moves={moves} onMove={onMove} />
        </span>
        {solved && (
          /* Mounts exactly when the last obligation closes, so the stamp-in animation plays once. */
          <div className="qed-stamp" aria-hidden="true">Q.E.D.</div>
        )}
      </div>
    </ScopeBox>
  );
}
