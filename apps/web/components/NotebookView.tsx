"use client";

import type { ProofSnapshot } from "@/lib/proof/browserProofBackend";
import { tokenizeScript } from "@/lib/scriptTokens";
import { Expression } from "./Expression";
import { ScopeBox } from "./EquationCard";
import { TokenSpans } from "./TokenSpans";

/** Read-back view: the theorem statement then one vellum cell per goal with its
 * inductive hypotheses and the recorded rewrite steps. */
export function NotebookView({ session }: { session: ProofSnapshot["session"] }) {
  return (
    <div className="notebook-view">
      <div className="source-cell"><TokenSpans segments={tokenizeScript(`theorem ${session.theorem} :\n  ${session.statement}`)} /></div>
      {session.goals.map((goal) => (
        <article className="proof-cell" key={goal.id}>
          <header><span>{goal.status === "solved" ? "✓" : "○"}</span> case {goal.label}</header>
          {goal.hypotheses.map((hypothesis) => <ScopeBox key={hypothesis.id} variables={hypothesis.binders?.map((binder) => binder.name) ?? []}><div className="notebook-ih">{hypothesis.name} · <Expression expression={hypothesis.left} moves={[]} onMove={() => undefined} /> = <Expression expression={hypothesis.right} moves={[]} onMove={() => undefined} /></div></ScopeBox>)}
          {goal.steps.map((step, index) => <div className="notebook-step" key={`${step.reason}-${index}`}><code>{step.equation}</code><small>{step.reason}</small></div>)}
        </article>
      ))}
    </div>
  );
}
