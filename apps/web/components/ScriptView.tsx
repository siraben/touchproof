"use client";

import type { ProofSnapshot } from "@/lib/proof/browserProofBackend";
import { tokenizeScript } from "@/lib/scriptTokens";
import { TokenSpans } from "./TokenSpans";

/** The exact dependent proof term, syntax-highlighted, plus kernel provenance. */
export function ScriptView({ state }: { state: ProofSnapshot }) {
  return (
    <div className="script-view">
      <div className="script-caption">Exact dependent proof term checked inside this browser</div>
      <pre><TokenSpans segments={tokenizeScript(state.script)} /></pre>
      <p>Every displayed transition is checked by {state.kernelVersion}; completed lessons assemble and recheck the exact closed theorem term. Last local check: {state.evidence.elapsedMs} ms.</p>
    </div>
  );
}
