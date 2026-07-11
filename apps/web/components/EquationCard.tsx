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

/** The hero sheet for a propositional obligation: one centered proposition on
 * the same .equation-card vellum, no `=`. The close affordance is the `exact`
 * move — a ✓ button that carries the same closable pulse the `=` has on
 * equation goals, and doubles as the drop target for a hypothesis dragged onto
 * the goal. Q.E.D. stamp and staggered reveal ride along unchanged. */
export function PropositionCard({
  proposition,
  moves,
  closeMove,
  busy,
  solved,
  onMove,
}: {
  proposition: ProgramExpr;
  moves: readonly ProofMove[];
  closeMove: ProofMove | undefined;
  busy: boolean;
  solved: boolean;
  onMove: (moveId: string) => void;
}) {
  return (
    <div className={`equation-card proposition-card ${busy ? "busy" : ""}`} onClick={(event) => event.stopPropagation()}>
      <Expression expression={proposition} moves={moves} onMove={onMove} />
      {/* The close affordance for a proposition is `exact`: fill the goal with a
          matching hypothesis. Unlike `=` (part of the statement itself), the ✓
          is pure affordance, so it only appears once an exact move exists. It
          closes on click and accepts the same handle drop (hypothesis id) that
          the goal proposition itself accepts. */}
      {closeMove !== undefined && (
        <button
          className="equals qed-check closable"
          disabled={busy}
          title="Close: this goal is exactly one of your assumptions"
          onClick={() => onMove(closeMove.id)}
          onDragOver={(event) => {
            const types = Array.from(event.dataTransfer.types);
            if (types.includes("application/x-touchproof-handle")) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const handle = event.dataTransfer.getData("application/x-touchproof-handle");
            const move = moves.find((candidate) => candidate.kind === "exact" && candidate.handle === handle);
            if (move !== undefined) onMove(move.id);
          }}
        >✓</button>
      )}
      {solved && (
        <div className="qed-stamp" aria-hidden="true">Q.E.D.</div>
      )}
    </div>
  );
}
