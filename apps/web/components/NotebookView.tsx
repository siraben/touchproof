"use client";

import { isPropositionGoal } from "@touchproof/core";
import type { ProofSnapshot } from "@/lib/proof/browserProofBackend";
import { tokenizeScript } from "@/lib/scriptTokens";
import { Expression } from "./Expression";
import { ScopeBox } from "./EquationCard";
import { TokenSpans } from "./TokenSpans";

/** Read-back view: the theorem statement then one vellum cell per goal. An
 * equation goal shows its inductive hypotheses and rewrite steps; a
 * proposition goal shows its assumptions and each intro/exact/destruct step. */
export function NotebookView({ session }: { session: ProofSnapshot["session"] }) {
  return (
    <div className="notebook-view">
      <div className="source-cell"><TokenSpans segments={tokenizeScript(`theorem ${session.theorem} :\n  ${session.statement}`)} /></div>
      {session.goals.map((goal) => (
        <article className="proof-cell" key={goal.id}>
          <header><span>{goal.status === "solved" ? "✓" : "○"}</span> {isPropositionGoal(goal) ? "goal" : "case"} {goal.label}</header>
          {isPropositionGoal(goal) ? (
            <>
              {goal.hypotheses.map((hypothesis) => (
                <div className="notebook-ih" key={hypothesis.id}>{hypothesis.name} · <Expression expression={hypothesis.proposition} moves={[]} onMove={() => undefined} /></div>
              ))}
              {goal.steps.map((step, index) => (
                <div className="notebook-step" key={`${step.reason}-${index}`}>
                  <code><Expression expression={step.proposition} moves={[]} onMove={() => undefined} /></code>
                  <small>{step.reason}</small>
                </div>
              ))}
            </>
          ) : (
            <>
              {goal.hypotheses.map((hypothesis) => <ScopeBox key={hypothesis.id} variables={hypothesis.binders?.map((binder) => binder.name) ?? []}><div className="notebook-ih">{hypothesis.name} · <Expression expression={hypothesis.left} moves={[]} onMove={() => undefined} /> = <Expression expression={hypothesis.right} moves={[]} onMove={() => undefined} /></div></ScopeBox>)}
              {goal.steps.map((step, index) => <div className="notebook-step" key={`${step.reason}-${index}`}><code>{step.equation}</code><small>{step.reason}</small></div>)}
            </>
          )}
        </article>
      ))}
    </div>
  );
}
