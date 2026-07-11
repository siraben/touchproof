"use client";

import type { RefObject } from "react";
import type { ProofSnapshot } from "@/lib/proof/browserProofBackend";

export type View = "visual" | "notebook" | "script";

/** The sticky application header: brand, view switch and the document actions
 * (undo/redo, export/import, the two-step reset) plus the kernel status lamp. */
export function TopBar({
  view,
  onView,
  busy,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
  onImportClick,
  confirmReset,
  onReset,
  importInput,
  onImportFile,
  kernelStatus,
}: {
  view: View;
  onView: (view: View) => void;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImportClick: () => void;
  confirmReset: boolean;
  onReset: () => void;
  importInput: RefObject<HTMLInputElement | null>;
  onImportFile: (file: File) => void;
  kernelStatus: ProofSnapshot["session"]["kernelStatus"];
}) {
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark">T</span><span>TouchProof</span><small>Learn by transforming</small></div>
      <div className="view-switch" aria-label="Proof view">
        <button className={view === "visual" ? "active" : ""} onClick={() => onView("visual")}>Visual</button>
        <button className={view === "notebook" ? "active" : ""} onClick={() => onView("notebook")}>Notebook</button>
        <button className={view === "script" ? "active" : ""} onClick={() => onView("script")}>Script</button>
      </div>
      <div className="header-actions">
        <button className="history-button" aria-label="Undo proof step" disabled={busy || !canUndo} title="Back one proof step" onClick={onUndo}>←</button>
        <button className="history-button" aria-label="Redo proof step" disabled={busy || !canRedo} title="Forward one proof step" onClick={onRedo}>→</button>
        <button disabled={busy} onClick={onExport}>Export</button>
        <button disabled={busy} onClick={onImportClick}>Import</button>
        <button
          className={confirmReset ? "confirm-reset" : ""}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onReset();
          }}
        >{confirmReset ? "Confirm reset" : "Reset"}</button>
        <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) onImportFile(file);
          event.target.value = "";
        }} />
        <div className={`kernel-badge ${kernelStatus}`}>
          <span />{kernelStatus === "checked" ? "Kernel checked locally" : "Kernel checks every move locally"}
        </div>
      </div>
    </header>
  );
}
