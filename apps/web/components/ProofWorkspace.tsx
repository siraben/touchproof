"use client";

import { decodeProofSession, type ProofMove } from "@touchproof/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  browserProofBackend,
  type ProofAction,
  type ProofSnapshot,
  type ProgressListener,
} from "@/lib/proof/browserProofBackend";
import { proofProgress } from "@/lib/viewModel";
import { LearningPath } from "./LearningPath";
import { NotebookView } from "./NotebookView";
import { ProofCanvas } from "./ProofCanvas";
import { ScriptView } from "./ScriptView";
import { SelectionContext } from "./selectionContext";
import { TitleBlock } from "./TitleBlock";
import { TopBar, type View } from "./TopBar";

// Re-exported so tests (and any embedders) can reach the renderer through the
// workspace module as before; its home is components/Expression.tsx.
export { Expression } from "./Expression";

const backend = browserProofBackend();
const MAX_DOCUMENT_BYTES = 200_000;

function progressText(progress: Parameters<ProgressListener>[0]): string {
  return progress.phase === "checking" ? "The TouchProof kernel is checking this proof…" : "Checking proof…";
}

export function ProofWorkspace() {
  const [state, setState] = useState<ProofSnapshot>();
  const [view, setView] = useState<View>("visual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loadingMessage, setLoadingMessage] = useState("Preparing the TouchProof kernel…");
  const [selection, setSelection] = useState<{ handle: string; x: number; y: number }>();
  const [preview, setPreview] = useState<ProofMove>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [undoStack, setUndoStack] = useState<ProofSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ProofSnapshot[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const bootstrapGeneration = useRef(0);
  const resetTimer = useRef<number>(undefined);

  useEffect(() => {
    const generation = ++bootstrapGeneration.current;
    const bootstrap = async () => {
      const saved = window.localStorage.getItem("touchproof:current:v5");
      if (saved !== null) {
        try {
          if (saved.length > MAX_DOCUMENT_BYTES) throw new Error("Saved proof is too large");
          const document: unknown = JSON.parse(saved);
          decodeProofSession(document);
          return await backend.restore(document, (progress) => {
            if (bootstrapGeneration.current === generation) setLoadingMessage(progressText(progress));
          });
        } catch (reason) {
          try {
            if (saved.length > MAX_DOCUMENT_BYTES) throw new Error("Saved proof is too large");
            const document: unknown = JSON.parse(saved);
            decodeProofSession(document);
          } catch {
            window.localStorage.removeItem("touchproof:current:v5");
            return backend.startLesson("bool-compute", (progress) => {
              if (bootstrapGeneration.current === generation) setLoadingMessage(progressText(progress));
            });
          }
          const detail = reason instanceof Error ? ` ${reason.message}` : "";
          throw new Error(`The TouchProof kernel could not recheck the saved proof. Your document is still stored.${detail}`);
        }
      }
      return backend.startLesson("bool-compute", (progress) => {
        if (bootstrapGeneration.current === generation) setLoadingMessage(progressText(progress));
      });
    };
    void bootstrap().then((result) => {
      if (bootstrapGeneration.current === generation) setState(result);
    }).catch((reason: unknown) => {
      if (bootstrapGeneration.current === generation) setError(reason instanceof Error ? reason.message : "Could not start TouchProof.");
    });
    return () => { bootstrapGeneration.current += 1; };
  }, []);

  useEffect(() => {
    if (state !== undefined) window.localStorage.setItem("touchproof:current:v5", JSON.stringify(state.session));
  }, [state]);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const startLesson = async (lessonId: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    try {
      setState(await backend.startLesson(lessonId, (progress) => setLoadingMessage(progressText(progress))));
      setUndoStack([]);
      setRedoStack([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start that lesson.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const reset = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    try {
      window.localStorage.removeItem("touchproof:current:v5");
      setState(await backend.startLesson(state?.session.lessonId ?? "bool-compute", (progress) => setLoadingMessage(progressText(progress))));
      setUndoStack([]);
      setRedoStack([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reset the lesson.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Two-step reset: the first click arms a vermilion "Confirm reset" for four
  // seconds; a second click resets; clicking elsewhere or the timeout reverts.
  const requestReset = () => {
    if (busy) return;
    window.clearTimeout(resetTimer.current);
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimer.current = window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    void reset();
  };

  const exportDocument = () => {
    if (state === undefined) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.session, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.session.lessonId}.touchproof.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importDocument = async (file: File) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error("The proof document is too large.");
      const text = await file.text();
      if (text.length > MAX_DOCUMENT_BYTES) throw new Error("The proof document is too large.");
      const session = JSON.parse(text) as unknown;
      const result = await backend.restore(session, (progress) => setLoadingMessage(progressText(progress)));
      setState(result);
      setUndoStack([]);
      setRedoStack([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proof document was rejected.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const send = async (action: ProofAction) => {
    if (state === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    try {
      const result = await backend.dispatch(state.session, action, (progress) => setLoadingMessage(progressText(progress)));
      if (action.kind === "apply-move") {
        setUndoStack((previous) => [...previous, state]);
        setRedoStack([]);
      }
      setState(result);
      setSelection(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proof step was rejected.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const currentGoal = state?.session.goals.find((goal) => goal.id === state.session.focusedGoalId);
  const progress = useMemo(() => state === undefined ? { solved: 0, total: 0 } : proofProgress(state.session), [state]);
  const solved = progress.total > 0 && progress.solved === progress.total;
  const analysisMove = state?.moves.find((move) => move.kind === "induction" || move.kind === "cases");
  const currentLesson = state?.lessons.find((lesson) => lesson.id === state.session.lessonId);
  const lessonIndex = state?.lessons.findIndex((lesson) => lesson.id === state.session.lessonId) ?? -1;
  const nextLesson = lessonIndex >= 0 ? state?.lessons[lessonIndex + 1] : undefined;
  const contextualMoves = state?.moves.filter((move) => move.handle === selection?.handle) ?? [];
  const closeMove = state?.moves.find((move) => move.kind === "close");
  const undo = () => {
    if (busy) return;
    const previous = undoStack.at(-1);
    if (previous === undefined || state === undefined) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items, state]);
    setState(previous);
    setSelection(undefined);
  };
  const redo = () => {
    if (busy) return;
    const next = redoStack.at(-1);
    if (next === undefined || state === undefined) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items, state]);
    setState(next);
    setSelection(undefined);
  };
  const selectHandle = (handle?: string, point?: { x: number; y: number }) => {
    if (handle === undefined) setSelection(undefined);
    else if (point !== undefined) setSelection({ handle, x: point.x, y: point.y });
  };
  const closeMenu = () => {
    setSelection(undefined);
    setPreview(undefined);
  };
  const previewProps = (move: ProofMove) => ({
    onPointerEnter: () => setPreview(move),
    onPointerLeave: () => setPreview(undefined),
    onFocus: () => setPreview(move),
    onBlur: () => setPreview(undefined),
  });

  if (state === undefined) {
    return <main className="loading"><div className="brand-mark">T</div><p>{error ?? loadingMessage}</p>{error !== undefined && <button onClick={() => window.location.reload()}>Retry</button>}</main>;
  }

  return (
    <SelectionContext.Provider value={{
      ...(selection === undefined ? {} : { selectedHandle: selection.handle }),
      ...(preview?.handle === undefined ? {} : { previewHandle: preview.handle }),
      ...(preview?.dropTarget === undefined ? {} : { previewTarget: preview.dropTarget }),
      select: selectHandle,
    }}>
    <main className="workspace" onClick={() => { setSelection(undefined); setConfirmReset(false); }}>
      <TopBar
        view={view}
        onView={setView}
        busy={busy}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={undo}
        onRedo={redo}
        onExport={exportDocument}
        onImportClick={() => importInput.current?.click()}
        confirmReset={confirmReset}
        onReset={requestReset}
        importInput={importInput}
        onImportFile={(file) => void importDocument(file)}
        kernelStatus={state.session.kernelStatus}
      />

      <TitleBlock lesson={currentLesson} solved={progress.solved} total={progress.total} />

      <div className="body-grid">
        <LearningPath
          lessons={state.lessons}
          currentLessonId={state.session.lessonId}
          currentLesson={currentLesson}
          busy={busy}
          onStartLesson={(lessonId) => void startLesson(lessonId)}
        />

        <section className="proof-stage">
          <div className="obligation-tabs" aria-label="Local proof obligations">
            {state.session.goals.map((goal, index) => (
              <button
                key={goal.id}
                disabled={busy}
                className={`${goal.id === state.session.focusedGoalId ? "active" : ""} ${goal.status}`}
                onClick={() => void send({ kind: "focus-goal", goalId: goal.id })}
              >
                <span>{goal.status === "solved" ? "✓" : index + 1}</span>{goal.label}
              </button>
            ))}
          </div>

          {view === "visual" && currentGoal !== undefined && (
            <ProofCanvas
              state={state}
              currentGoal={currentGoal}
              moves={state.moves}
              preview={preview}
              analysisMove={analysisMove}
              busy={busy}
              solved={solved}
              closeMove={closeMove}
              nextLesson={nextLesson}
              selection={selection}
              contextualMoves={contextualMoves}
              onSend={(moveId) => void send({ kind: "apply-move", moveId })}
              onSelectHandle={(handle, point) => selectHandle(handle, point)}
              onCloseMenu={closeMenu}
              onPreview={setPreview}
              previewProps={previewProps}
              onStartLesson={(lessonId) => void startLesson(lessonId)}
            />
          )}

          {view === "notebook" && <NotebookView session={state.session} />}
          {view === "script" && <ScriptView state={state} />}
          {error !== undefined && <div className="error-toast" role="alert">{error}</div>}
          {busy && error === undefined && <div className="checking-toast" role="status" aria-live="polite">{loadingMessage}</div>}
        </section>
      </div>
    </main>
    </SelectionContext.Provider>
  );
}
