"use client";

import {
  definitionByName,
  decodeProofSession,
  inductiveByName,
  type ProgramExpr,
  type ProofMove,
} from "@touchproof/core";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  browserProofBackend,
  type ProofAction,
  type ProofSnapshot,
  type ProgressListener,
} from "@/lib/proof/browserProofBackend";
import type { Segment } from "@/lib/doc";
import { clauseToSegments, expressionShape, inductiveToSegments } from "@/lib/programDoc";
import { tokenizeScript } from "@/lib/scriptTokens";
import { dropMove, movesForHandle, proofProgress } from "@/lib/viewModel";

type View = "visual" | "notebook" | "script";

const backend = browserProofBackend();
const MAX_DOCUMENT_BYTES = 200_000;
// Definition-card code column budget: the card body is 285px wide minus
// 2 x 11px padding = 263px; at 12px ui-monospace (~0.6em = 7.2px advance)
// that is ~36 characters, with the pretty-printer breaking anything longer.
const DEFINITION_CARD_CODE_COLUMNS = 36;
// The DOM view renders every node as a tappable span (no [x] list sugar), so
// cons stays a binary operator for parenthesization purposes.
const DOM_SHAPE = { listLiterals: false } as const;

function progressText(progress: Parameters<ProgressListener>[0]): string {
  return progress.phase === "checking" ? "The TouchProof kernel is checking this proof…" : "Checking proof…";
}

function moveIcon(move: ProofMove): string {
  if (move.kind === "cases") return "⑂";
  if (move.kind === "induction") return "ℕ";
  if (move.kind === "generalize") return "∀";
  if (move.kind === "rewrite") return "⇢";
  if (move.kind === "close") return "✓";
  return "↳";
}

/** Ordered highlighted runs (doc segments or tokenizer output) as spans. */
function TokenSpans({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.tag === undefined
          ? <span key={index}>{segment.text}</span>
          : <span key={index} className={`tok-${segment.tag}`}>{segment.text}</span>)}
    </>
  );
}

const SelectionContext = createContext<{
  selectedHandle?: string;
  previewHandle?: string;
  previewTarget?: string;
  select: (handle?: string, point?: { x: number; y: number }) => void;
}>({ select: () => undefined });

function CanvasCard({
  title,
  initial,
  anchor = "left",
  className = "",
  children,
}: {
  title: string;
  // For anchor "left" this is the left/top offset; for "right" it is the
  // right/top offset (distance from the right edge of the offsetParent).
  initial: { x: number; y: number };
  anchor?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  // A right-anchored card floats against the right edge until the user first
  // drags it. On drag start we measure its box against the offsetParent and
  // convert to absolute left/top so it never overlaps the centered equation.
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>(
    anchor === "left" ? initial : undefined,
  );
  const cardRef = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | undefined>(undefined);
  const style =
    position === undefined
      ? { right: initial.x, top: initial.y }
      : { left: position.x, top: position.y };
  return (
    <section ref={cardRef} className={`canvas-card ${className}`} style={style} onClick={(event) => event.stopPropagation()}>
      <header
        className="canvas-card-handle"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          // Resolve the current on-screen position so a right-anchored card
          // keeps its exact spot at the moment the drag begins.
          let current = position;
          if (current === undefined && cardRef.current !== null) {
            const parent = cardRef.current.offsetParent as HTMLElement | null;
            const cardRect = cardRef.current.getBoundingClientRect();
            const parentRect = parent?.getBoundingClientRect();
            current = {
              x: cardRect.left - (parentRect?.left ?? 0),
              y: cardRect.top - (parentRect?.top ?? 0),
            };
            setPosition(current);
          }
          const base = current ?? initial;
          drag.current = { pointerId: event.pointerId, dx: event.clientX - base.x, dy: event.clientY - base.y };
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          setPosition({ x: Math.max(8, event.clientX - drag.current.dx), y: Math.max(8, event.clientY - drag.current.dy) });
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = undefined;
        }}
      ><span>⠿</span>{title}</header>
      <div className="canvas-card-body">{children}</div>
    </section>
  );
}

interface ExpressionProps {
  expression: ProgramExpr;
  moves: readonly ProofMove[];
  onMove: (moveId: string) => void;
}

/** An operand of an infix operator: nested infix expressions are wrapped,
 * exactly mirroring the pretty-printer's shared shape rules. */
function ExprOperand({ expression, moves, onMove }: ExpressionProps) {
  const wrap = expressionShape(expression, DOM_SHAPE) === "binary";
  return (
    <>
      {wrap && <span className="paren">(</span>}
      <Expression expression={expression} moves={moves} onMove={onMove} />
      {wrap && <span className="paren">)</span>}
    </>
  );
}

/** An argument of a juxtaposed application: everything but atoms is wrapped.
 * The .argument span provides the spacing; no space characters means the
 * head can never be split from its argument by line wrapping. */
function ExprArgument({ expression, moves, onMove }: ExpressionProps) {
  const wrap = expressionShape(expression, DOM_SHAPE) !== "atom";
  return (
    <span className="argument">
      {wrap && <span className="paren">(</span>}
      <Expression expression={expression} moves={moves} onMove={onMove} />
      {wrap && <span className="paren">)</span>}
    </span>
  );
}

// Exported for tests: the parenthesization must stay in lockstep with the
// pretty-printer (both build on expressionShape).
export function Expression({ expression, moves, onMove }: ExpressionProps) {
  const selection = useContext(SelectionContext);
  const fromHere = movesForHandle(moves, expression.id);
  const isDropTarget = moves.some((move) => move.dropTarget === expression.id);

  const content = (() => {
    if (expression.kind === "var") return expression.name;
    if (expression.kind === "ctor") {
      if (expression.name === "nil") return "[]";
      if (expression.name === "zero") return "0";
      if (expression.name === "succ" && expression.args.length === 1) {
        return <><span className="function-name">S</span><ExprArgument expression={expression.args[0]!} moves={moves} onMove={onMove} /></>;
      }
      if (expression.name === "cons" && expression.args.length === 2) {
        // Breakable space BEFORE the operator, NBSP after: a wrapped operator starts the continuation line.
        return <><ExprOperand expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="operator">{" ::\u00A0"}</span><ExprOperand expression={expression.args[1]!} moves={moves} onMove={onMove} /></>;
      }
      return <>{expression.name}{expression.args.map((arg) => <ExprArgument key={arg.id} expression={arg} moves={moves} onMove={onMove} />)}</>;
    }
    if (expression.name === "compose" && expression.args.length === 2) {
      return <><span className="paren">(</span><ExprOperand expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="operator">{" ∘\u00A0"}</span><ExprOperand expression={expression.args[1]!} moves={moves} onMove={onMove} /><span className="paren">)</span></>;
    }
    if (expression.name === "apply" && expression.args.length === 2) {
      return <><ExprOperand expression={expression.args[0]!} moves={moves} onMove={onMove} /><ExprArgument expression={expression.args[1]!} moves={moves} onMove={onMove} /></>;
    }
    if ((expression.name === "add" || expression.name === "append") && expression.args.length === 2) {
      return <><ExprOperand expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="operator">{expression.name === "add" ? " +\u00A0" : " ++\u00A0"}</span><ExprOperand expression={expression.args[1]!} moves={moves} onMove={onMove} /></>;
    }
    return <><span className="function-name">{expression.name}</span>{expression.args.map((arg) => <ExprArgument key={arg.id} expression={arg} moves={moves} onMove={onMove} />)}</>;
  })();

  return (
    <span
      className={`expression ${fromHere.length > 0 ? "movable tappable" : ""} ${selection.selectedHandle === expression.id ? "selected" : ""} ${isDropTarget ? "drop-target" : ""} ${selection.previewHandle === expression.id ? "preview-target" : ""} ${selection.previewTarget === expression.id ? "preview-dest" : ""}`}
      draggable={fromHere.length > 0}
      role={fromHere.length === 0 ? undefined : "button"}
      tabIndex={fromHere.length === 0 ? undefined : 0}
      title={fromHere.length === 0 ? undefined : "Click for proof actions, or drag to a highlighted target"}
      onClick={(event) => {
        if (fromHere.length === 0) return;
        event.stopPropagation();
        selection.select(
          selection.selectedHandle === expression.id ? undefined : expression.id,
          { x: event.clientX, y: event.clientY },
        );
      }}
      onKeyDown={(event) => {
        if (fromHere.length > 0 && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          selection.select(expression.id, { x: bounds.right, y: bounds.bottom });
        }
      }}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData("application/x-touchproof-handle", expression.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        const types = Array.from(event.dataTransfer.types);
        if (isDropTarget && types.includes("application/x-touchproof-handle")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const handle = event.dataTransfer.getData("application/x-touchproof-handle");
        const move = dropMove(moves, handle, expression.id);
        if (move !== undefined) onMove(move.id);
      }}
    >
      {content}
    </span>
  );
}

function ScopeBox({ variables, children }: { variables: readonly string[]; children: React.ReactNode }) {
  return variables.reduceRight<React.ReactNode>((content, variable) => (
    <div className="scope-box" key={variable}>
      <div className="scope-label">∀ {variable}<span>scope</span></div>
      {content}
    </div>
  ), children);
}

function MoveContextMenu({
  moves,
  anchor,
  onPick,
  onClose,
  onPreview,
}: {
  moves: readonly ProofMove[];
  anchor: { x: number; y: number };
  onPick: (moveId: string) => void;
  onClose: () => void;
  onPreview: (move?: ProofMove) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; flipped: boolean }>({ left: anchor.x, top: anchor.y, flipped: false });

  // Measure the real menu box, clamp it to the viewport and flip it above the
  // anchor when it would overflow below (runs before paint — no flicker).
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;
    const { width, height } = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 22));
    const flipped = anchor.y + height + 30 > window.innerHeight;
    const top = flipped ? Math.max(8, anchor.y - height - 22) : anchor.y;
    setPlacement({ left, top, flipped });
  }, [anchor.x, anchor.y, moves.length]);

  // Standard menu focus: remember the opener, focus the first item on open,
  // return focus to the opener when the menu closes (Escape, pick, outside click).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => opener?.focus();
  }, []);

  const moveFocus = (delta: number) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    if (items.length === 0) return;
    const active = items.findIndex((item) => item === document.activeElement);
    const next = active === -1 ? (delta > 0 ? 0 : items.length - 1) : (active + delta + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div
      ref={menuRef}
      className={`context-menu ${placement.flipped ? "flipped" : ""}`}
      role="menu"
      style={{ left: placement.left, top: placement.top }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          moveFocus(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(-1);
        }
      }}
    >
      <div className="context-menu-title">What do you want to do here?</div>
      {moves.map((move) => (
        <button
          role="menuitem"
          key={move.id}
          onClick={() => onPick(move.id)}
          onPointerEnter={() => onPreview(move)}
          onPointerLeave={() => onPreview(undefined)}
          onFocus={() => onPreview(move)}
          onBlur={() => onPreview(undefined)}
        >
          <span>{moveIcon(move)}</span>
          <div><strong>{move.label}</strong><small>{move.explanation}</small></div>
        </button>
      ))}
      {moves.some((move) => move.dropTarget !== undefined) && <p>You can also drag this term onto a highlighted target.</p>}
    </div>
  );
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
      const saved = window.localStorage.getItem("touchproof:current:v4");
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
            window.localStorage.removeItem("touchproof:current:v4");
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
    if (state !== undefined) window.localStorage.setItem("touchproof:current:v4", JSON.stringify(state.session));
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
      window.localStorage.removeItem("touchproof:current:v4");
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
      <header className="topbar">
        <div className="brand"><span className="brand-mark">T</span><span>TouchProof</span><small>Learn by transforming</small></div>
        <div className="view-switch" aria-label="Proof view">
          <button className={view === "visual" ? "active" : ""} onClick={() => setView("visual")}>Visual</button>
          <button className={view === "notebook" ? "active" : ""} onClick={() => setView("notebook")}>Notebook</button>
          <button className={view === "script" ? "active" : ""} onClick={() => setView("script")}>Script</button>
        </div>
        <div className="header-actions">
          <button className="history-button" aria-label="Undo proof step" disabled={busy || undoStack.length === 0} title="Back one proof step" onClick={undo}>←</button>
          <button className="history-button" aria-label="Redo proof step" disabled={busy || redoStack.length === 0} title="Forward one proof step" onClick={redo}>→</button>
          <button disabled={busy} onClick={exportDocument}>Export</button>
          <button disabled={busy} onClick={() => importInput.current?.click()}>Import</button>
          <button
            className={confirmReset ? "confirm-reset" : ""}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              requestReset();
            }}
          >{confirmReset ? "Confirm reset" : "Reset"}</button>
          <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void importDocument(file);
            event.target.value = "";
          }} />
          <div className={`kernel-badge ${state.session.kernelStatus}`}>
            <span />{state.session.kernelStatus === "checked" ? "Kernel checked locally" : "Kernel checks every move locally"}
          </div>
        </div>
      </header>

      <section className="lesson-strip">
        <div><span className="eyebrow">{currentLesson?.chapter} · {currentLesson?.concept}</span><h1>{currentLesson?.title}</h1></div>
        <p>Transform both sides until they are visibly the same. Touch highlighted calls, then solve only the local obligations.</p>
        <div className="progress"><strong>{progress.solved}/{progress.total}</strong><span>obligations</span></div>
      </section>

      <div className="body-grid">
        <aside className="context-panel">
          <h2>Learning path</h2>
          <nav className="lesson-list" aria-label="Lessons">
            {state.lessons.map((lesson, index) => (
              <button
                className={lesson.id === state.session.lessonId ? "active" : ""}
                disabled={busy}
                key={lesson.id}
                onClick={() => void startLesson(lesson.id)}
              ><span>{index + 1}</span><div><strong>{lesson.title}</strong><small>{lesson.concept}</small></div></button>
            ))}
          </nav>
          {currentLesson !== undefined && <a className="lesson-source" href={currentLesson.sourceUrl} target="_blank" rel="noreferrer">{currentLesson.source} ↗</a>}
        </aside>

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
            /* Keyed by lesson so the staggered drafting-table reveal replays on lesson load. */
            <div className="visual-view" key={state.session.lessonId}>
              <CanvasCard key={`context-${state.session.lessonId}-${currentGoal.id}`} title="Local context" initial={{ x: 22, y: 72 }} className="context-canvas-card">
                <div className="context-list">
                  {currentGoal.context.length === 0 ? <small>No variables yet—just compute.</small> : currentGoal.context.map((binding) => (
                    <code
                      key={binding}
                      className={preview?.variable !== undefined && binding.startsWith(`${preview.variable} :`) ? "preview-target" : ""}
                    >{binding}</code>
                  ))}
                </div>
                {currentGoal.hypotheses.map((hypothesis) => (
                  <div
                    className={`hypothesis-card ${state.moves.some((move) => move.handle === hypothesis.id) ? "tappable" : ""} ${preview?.handle === hypothesis.id ? "preview-target" : ""}`}
                    draggable
                    key={hypothesis.id}
                    role={state.moves.some((move) => move.handle === hypothesis.id) ? "button" : undefined}
                    tabIndex={state.moves.some((move) => move.handle === hypothesis.id) ? 0 : undefined}
                    title="Click for rewrite options, or drag onto a matching expression"
                    onClick={(event) => {
                      if (!state.moves.some((move) => move.handle === hypothesis.id)) return;
                      event.stopPropagation();
                      selectHandle(hypothesis.id, { x: event.clientX, y: event.clientY });
                    }}
                    onKeyDown={(event) => {
                      if (!state.moves.some((move) => move.handle === hypothesis.id) || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      const bounds = event.currentTarget.getBoundingClientRect();
                      selectHandle(hypothesis.id, { x: bounds.right, y: bounds.bottom });
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-touchproof-handle", hypothesis.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <span>{hypothesis.binders === undefined ? hypothesis.name : `∀ ${hypothesis.binders.map((binder) => binder.name).join(" ")}, ${hypothesis.name}`}</span>
                    <div><Expression expression={hypothesis.left} moves={[]} onMove={() => undefined} /> = <Expression expression={hypothesis.right} moves={[]} onMove={() => undefined} /></div>
                    <small>Click for options or drag onto a matching expression</small>
                  </div>
                ))}
                {analysisMove !== undefined && (
                  <div
                    id="analysis-zone"
                    className={`induction-zone ${preview !== undefined && (preview.kind === "induction" || preview.kind === "cases") ? "preview-dest" : ""}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const handle = event.dataTransfer.getData("application/x-touchproof-handle");
                      const move = dropMove(state.moves, handle, "analysis-zone");
                      if (move !== undefined) void send({ kind: "apply-move", moveId: move.id });
                    }}
                  >
                    <strong>{analysisMove.kind === "cases" ? "Analyze this value" : "Use induction"}</strong>
                    <span>Drag <code>{analysisMove.variable}</code> here—or click it and choose the action.</span>
                  </div>
                )}
              </CanvasCard>
              {(() => {
                const inductives = state.session.inductiveNames.map(inductiveByName).filter((definition) => definition !== undefined);
                const definitions = state.session.definitionNames.map(definitionByName).filter((definition) => definition !== undefined);
                // Right-anchored side column: 24px from the right edge, cards
                // stacked from the top with compact fixed spacing. Definitions
                // continue the same column below the inductive cards so the two
                // groups never overlap the move palette or each other.
                const columnTop = 72;
                const rowGap = 150;
                return (
                  <>
                    {inductives.map((definition, index) => (
                      <CanvasCard key={`${state.session.lessonId}-${definition.name}`} title={`data ${definition.name}`} anchor="right" initial={{ x: 24, y: columnTop + index * rowGap }} className="definition-canvas-card">
                        <code><TokenSpans segments={inductiveToSegments(definition, DEFINITION_CARD_CODE_COLUMNS)} /></code>
                        <small>Cases and induction are generated from these constructors.</small>
                      </CanvasCard>
                    ))}
                    {definitions.map((definition, index) => (
                      <CanvasCard key={`${state.session.lessonId}-${definition.name}`} title={`${definition.name} : ${definition.type}`} anchor="right" initial={{ x: 24, y: columnTop + (inductives.length + index) * rowGap }} className="definition-canvas-card">
                        {definition.clauses.map((clause) => <code key={clause.script}><TokenSpans segments={clauseToSegments(definition.name, clause, DEFINITION_CARD_CODE_COLUMNS)} /></code>)}
                        <small>These equations are the available computation rules.</small>
                      </CanvasCard>
                    ))}
                  </>
                );
              })()}
              <div className="case-label">Current obligation · {currentGoal.label}</div>
              <ScopeBox variables={state.session.generalizedVariables}>
                <div className={`equation-card ${busy ? "busy" : ""}`} onClick={(event) => event.stopPropagation()}>
                  <Expression expression={currentGoal.left} moves={state.moves} onMove={(moveId) => void send({ kind: "apply-move", moveId })} />
                  {/* The = stays glued to the start of the RHS: when the card is too
                      narrow for one line, this whole group wraps as the second line. */}
                  <span className="equation-rhs">
                    <button
                      className={`equals ${closeMove === undefined ? "" : "closable"}`}
                      disabled={closeMove === undefined || busy}
                      title={closeMove === undefined ? "Keep transforming until both sides match" : "Close by reflexivity"}
                      onClick={() => closeMove !== undefined && void send({ kind: "apply-move", moveId: closeMove.id })}
                    >=</button>
                    <Expression expression={currentGoal.right} moves={state.moves} onMove={(moveId) => void send({ kind: "apply-move", moveId })} />
                  </span>
                  {solved && (
                    /* Mounts exactly when the last obligation closes, so the stamp-in animation plays once. */
                    <div className="qed-stamp" aria-hidden="true">Q.E.D.</div>
                  )}
                </div>
              </ScopeBox>
              {selection !== undefined && contextualMoves.length > 0 && (
                <MoveContextMenu
                  moves={contextualMoves}
                  anchor={{ x: selection.x, y: selection.y }}
                  onPick={(moveId) => void send({ kind: "apply-move", moveId })}
                  onClose={closeMenu}
                  onPreview={setPreview}
                />
              )}
              <div className="gesture-hint">
                <span className="cursor-icon">{solved ? "✓" : "↖"}</span>
                {solved
                  ? "Proved and kernel-checked. Read it back in the Notebook, or continue."
                  : state.moves.some((move) => move.kind === "rewrite")
                    ? "Drag IH onto the matching recursive call"
                    : analysisMove !== undefined
                      ? `Drag ${analysisMove.variable} into the analysis tray`
                      : "Touch a dotted expression to apply its defining equation"}
              </div>
              {!solved && <div className="canvas-help"><strong>Suggested move</strong><span>{state.moves[0]?.explanation ?? "Every local obligation is complete."}</span></div>}
              <div className="move-palette">
                {solved && nextLesson !== undefined && (
                  <button className="next-lesson" disabled={busy} onClick={() => void startLesson(nextLesson.id)}>
                    <span>→</span>
                    <div><strong>Next lesson</strong><small>{nextLesson.title}</small></div>
                  </button>
                )}
                {state.moves.map((move, index) => (
                  <button
                    key={move.id}
                    className={index === 0 ? "suggested" : ""}
                    disabled={busy}
                    onClick={() => void send({ kind: "apply-move", moveId: move.id })}
                    {...previewProps(move)}
                  >
                    <span>{moveIcon(move)}</span>
                    <div><strong>{move.label}</strong><small>{move.explanation}</small></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "notebook" && (
            <div className="notebook-view">
              <div className="source-cell"><TokenSpans segments={tokenizeScript(`theorem ${state.session.theorem} :\n  ${state.session.statement}`)} /></div>
              {state.session.goals.map((goal) => (
                <article className="proof-cell" key={goal.id}>
                  <header><span>{goal.status === "solved" ? "✓" : "○"}</span> case {goal.label}</header>
                  {goal.hypotheses.map((hypothesis) => <ScopeBox key={hypothesis.id} variables={hypothesis.binders?.map((binder) => binder.name) ?? []}><div className="notebook-ih">{hypothesis.name} · <Expression expression={hypothesis.left} moves={[]} onMove={() => undefined} /> = <Expression expression={hypothesis.right} moves={[]} onMove={() => undefined} /></div></ScopeBox>)}
                  {goal.steps.map((step, index) => <div className="notebook-step" key={`${step.reason}-${index}`}><code>{step.equation}</code><small>{step.reason}</small></div>)}
                </article>
              ))}
            </div>
          )}
          {view === "script" && (
            <div className="script-view">
              <div className="script-caption">Exact dependent proof term checked inside this browser</div>
              <pre><TokenSpans segments={tokenizeScript(state.script)} /></pre>
              <p>Every displayed transition is checked by {state.kernelVersion}; completed lessons assemble and recheck the exact closed theorem term. Last local check: {state.evidence.elapsedMs} ms.</p>
            </div>
          )}
          {error !== undefined && <div className="error-toast" role="alert">{error}</div>}
          {busy && error === undefined && <div className="checking-toast" role="status" aria-live="polite">{loadingMessage}</div>}
        </section>
      </div>
    </main>
    </SelectionContext.Provider>
  );
}
