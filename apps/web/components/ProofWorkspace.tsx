"use client";

import {
  definitionByName,
  definitionsToScript,
  inductiveByName,
  inductiveToScript,
  type Lesson,
  type ProgramExpr,
  type ProofMove,
  type ProofSession,
} from "@touchproof/core";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { dropMove, movesForHandle, proofProgress } from "@/lib/viewModel";

type ApiState = { session: ProofSession; moves: ProofMove[]; lessons: Lesson[] };
type View = "visual" | "notebook" | "script";

const SelectionContext = createContext<{
  selectedHandle?: string;
  select: (handle?: string, point?: { x: number; y: number }) => void;
}>({ select: () => undefined });

function CanvasCard({
  title,
  initial,
  className = "",
  children,
}: {
  title: string;
  initial: { x: number; y: number };
  className?: string;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState(initial);
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | undefined>(undefined);
  return (
    <section className={`canvas-card ${className}`} style={{ left: position.x, top: position.y }} onClick={(event) => event.stopPropagation()}>
      <header
        className="canvas-card-handle"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, dx: event.clientX - position.x, dy: event.clientY - position.y };
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

function Expression({
  expression,
  moves,
  onMove,
}: {
  expression: ProgramExpr;
  moves: readonly ProofMove[];
  onMove: (moveId: string) => void;
}) {
  const selection = useContext(SelectionContext);
  const fromHere = movesForHandle(moves, expression.id);
  const isDropTarget = moves.some((move) => move.dropTarget === expression.id);

  const content = (() => {
    if (expression.kind === "var") return expression.name;
    if (expression.kind === "ctor") {
      if (expression.name === "nil") return "[]";
      if (expression.name === "zero") return "0";
      if (expression.name === "succ" && expression.args.length === 1) {
        return <><span className="function-name">S</span><span className="paren"> (</span><Expression expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="paren">)</span></>;
      }
      if (expression.name === "cons" && expression.args.length === 2) {
        return <><Expression expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="operator"> :: </span><Expression expression={expression.args[1]!} moves={moves} onMove={onMove} /></>;
      }
      return <>{expression.name} {expression.args.map((arg) => <Expression key={arg.id} expression={arg} moves={moves} onMove={onMove} />)}</>;
    }
    if (expression.name === "compose" && expression.args.length === 2) {
      return <><span className="paren">(</span><Expression expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="operator"> ∘ </span><Expression expression={expression.args[1]!} moves={moves} onMove={onMove} /><span className="paren">)</span></>;
    }
    if (expression.name === "apply" && expression.args.length === 2) {
      return <><Expression expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="paren">(</span><Expression expression={expression.args[1]!} moves={moves} onMove={onMove} /><span className="paren">)</span></>;
    }
    if (expression.name === "map" && expression.args.length === 2) {
      const value = expression.args[1]!;
      const needsParens = value.kind === "call" || (value.kind === "ctor" && value.name !== "nil");
      return <><span className="function-name">map</span><span className="argument"><Expression expression={expression.args[0]!} moves={moves} onMove={onMove} /></span><span className="argument">{needsParens && <span className="paren">(</span>}<Expression expression={value} moves={moves} onMove={onMove} />{needsParens && <span className="paren">)</span>}</span></>;
    }
    if (expression.name === "negb" && expression.args.length === 1) {
      const value = expression.args[0]!;
      const needsParens = value.kind === "call";
      return <><span className="function-name">negb</span><span className="argument">{needsParens && <span className="paren">(</span>}<Expression expression={value} moves={moves} onMove={onMove} />{needsParens && <span className="paren">)</span>}</span></>;
    }
    if (expression.name === "rev" && expression.args.length === 1) {
      const value = expression.args[0]!;
      const needsParens = value.kind === "call" || (value.kind === "ctor" && value.name !== "nil");
      return <><span className="function-name">rev</span><span className="argument">{needsParens && <span className="paren">(</span>}<Expression expression={value} moves={moves} onMove={onMove} />{needsParens && <span className="paren">)</span>}</span></>;
    }
    if ((expression.name === "add" || expression.name === "append") && expression.args.length === 2) {
      return <><Expression expression={expression.args[0]!} moves={moves} onMove={onMove} /><span className="operator"> {expression.name === "add" ? "+" : "++"} </span><Expression expression={expression.args[1]!} moves={moves} onMove={onMove} /></>;
    }
    return <><span className="function-name">{expression.name}</span>{expression.args.map((arg) => <span className="argument" key={arg.id}><Expression expression={arg} moves={moves} onMove={onMove} /></span>)}</>;
  })();

  return (
    <span
      className={`expression ${fromHere.length > 0 ? "movable tappable" : ""} ${selection.selectedHandle === expression.id ? "selected" : ""} ${isDropTarget ? "drop-target" : ""}`}
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

export function ProofWorkspace() {
  const [state, setState] = useState<ApiState>();
  const [view, setView] = useState<View>("visual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selection, setSelection] = useState<{ handle: string; x: number; y: number }>();
  const [undoStack, setUndoStack] = useState<ApiState[]>([]);
  const [redoStack, setRedoStack] = useState<ApiState[]>([]);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const bootstrap = async () => {
      const saved = window.localStorage.getItem("touchproof:current:v3");
      if (saved !== null) {
        const restored = await fetch("/api/proof", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session: JSON.parse(saved) as unknown, inspect: true }),
        });
        if (restored.ok) return restored.json() as Promise<ApiState>;
        window.localStorage.removeItem("touchproof:current:v3");
      }
      const fresh = await fetch("/api/proof");
      if (!fresh.ok) throw new Error("Could not start the proof session.");
      return fresh.json() as Promise<ApiState>;
    };
    bootstrap().then(setState).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not start TouchProof."));
  }, []);

  useEffect(() => {
    if (state !== undefined) window.localStorage.setItem("touchproof:current:v3", JSON.stringify(state.session));
  }, [state]);

  const startLesson = async (lessonId: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/proof?lesson=${encodeURIComponent(lessonId)}`);
      if (!response.ok) throw new Error("Could not start that lesson.");
      setState(await response.json() as ApiState);
      setUndoStack([]);
      setRedoStack([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start that lesson.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      window.localStorage.removeItem("touchproof:current:v3");
      const response = await fetch(`/api/proof?lesson=${encodeURIComponent(state?.session.lessonId ?? "bool-involution")}`);
      setState(await response.json() as ApiState);
      setUndoStack([]);
      setRedoStack([]);
    } finally {
      setBusy(false);
    }
  };

  const exportDocument = () => {
    if (state === undefined) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.session, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "map-comp.touchproof.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importDocument = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const session = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session, inspect: true }),
      });
      const result = await response.json() as ApiState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The proof document was rejected.");
      setState(result);
      setUndoStack([]);
      setRedoStack([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proof document was rejected.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (payload: { moveId?: string; focusGoalId?: string }) => {
    if (state === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: state.session, ...payload }),
      });
      const result = await response.json() as ApiState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The proof step was rejected.");
      setUndoStack((previous) => [...previous, state]);
      setRedoStack([]);
      setState(result);
      setSelection(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proof step was rejected.");
    } finally {
      setBusy(false);
    }
  };

  const currentGoal = state?.session.goals.find((goal) => goal.id === state.session.focusedGoalId);
  const progress = useMemo(() => state === undefined ? { solved: 0, total: 0 } : proofProgress(state.session), [state]);
  const analysisMove = state?.moves.find((move) => move.kind === "induction" || move.kind === "cases");
  const currentLesson = state?.lessons.find((lesson) => lesson.id === state.session.lessonId);
  const contextualMoves = state?.moves.filter((move) => move.handle === selection?.handle) ?? [];
  const closeMove = state?.moves.find((move) => move.kind === "close");
  const undo = () => {
    const previous = undoStack.at(-1);
    if (previous === undefined || state === undefined) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items, state]);
    setState(previous);
    setSelection(undefined);
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (next === undefined || state === undefined) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items, state]);
    setState(next);
    setSelection(undefined);
  };

  if (state === undefined) {
    return <main className="loading"><div className="brand-mark">T</div><p>{error ?? "Preparing the proof…"}</p></main>;
  }

  return (
    <SelectionContext.Provider value={{
      ...(selection === undefined ? {} : { selectedHandle: selection.handle }),
      select: (handle, point) => {
        if (handle === undefined) setSelection(undefined);
        else if (point !== undefined) setSelection({
          handle,
          x: Math.min(point.x, window.innerWidth - 410),
          y: Math.min(point.y, window.innerHeight - 290),
        });
      },
    }}>
    <main className="workspace" onClick={() => setSelection(undefined)}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">T</span><span>TouchProof</span><small>Learn by transforming</small></div>
        <div className="view-switch" aria-label="Proof view">
          <button className={view === "visual" ? "active" : ""} onClick={() => setView("visual")}>Visual</button>
          <button className={view === "notebook" ? "active" : ""} onClick={() => setView("notebook")}>Notebook</button>
          <button className={view === "script" ? "active" : ""} onClick={() => setView("script")}>Script</button>
        </div>
        <div className="header-actions">
          <button className="history-button" disabled={undoStack.length === 0} title="Back one proof step" onClick={undo}>←</button>
          <button className="history-button" disabled={redoStack.length === 0} title="Forward one proof step" onClick={redo}>→</button>
          <button onClick={exportDocument}>Export</button>
          <button onClick={() => importInput.current?.click()}>Import</button>
          <button onClick={() => void reset()}>Reset</button>
          <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void importDocument(file);
            event.target.value = "";
          }} />
          <div className={`kernel-badge ${state.session.kernelStatus}`}>
            <span />{state.session.kernelStatus === "checked" ? "Kernel checked" : "Checking each move"}
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
                onClick={() => void send({ focusGoalId: goal.id })}
              >
                <span>{goal.status === "solved" ? "✓" : index + 1}</span>{goal.label}
              </button>
            ))}
          </div>

          {view === "visual" && currentGoal !== undefined && (
            <div className="visual-view">
              <CanvasCard key={`context-${state.session.lessonId}-${currentGoal.id}`} title="Local context" initial={{ x: 22, y: 72 }} className="context-canvas-card">
                <div className="context-list">
                  {currentGoal.context.length === 0 ? <small>No variables yet—just compute.</small> : currentGoal.context.map((binding) => <code key={binding}>{binding}</code>)}
                </div>
                {currentGoal.hypotheses.map((hypothesis) => (
                  <div
                    className="hypothesis-card"
                    draggable
                    key={hypothesis.id}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-touchproof-handle", hypothesis.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <span>{hypothesis.name}</span>
                    <div><Expression expression={hypothesis.left} moves={[]} onMove={() => undefined} /> = <Expression expression={hypothesis.right} moves={[]} onMove={() => undefined} /></div>
                    <small>Click for options or drag onto a matching expression</small>
                  </div>
                ))}
                {analysisMove !== undefined && (
                  <div
                    id="analysis-zone"
                    className="induction-zone"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const handle = event.dataTransfer.getData("application/x-touchproof-handle");
                      const move = dropMove(state.moves, handle, "analysis-zone");
                      if (move !== undefined) void send({ moveId: move.id });
                    }}
                  >
                    <strong>{analysisMove.kind === "cases" ? "Analyze this value" : "Use induction"}</strong>
                    <span>Drag <code>{state.session.analysis?.variable}</code> here—or click it and choose the action.</span>
                  </div>
                )}
              </CanvasCard>
              {state.session.inductiveNames.map(inductiveByName).filter((definition) => definition !== undefined).map((definition, index) => (
                <CanvasCard key={`${state.session.lessonId}-${definition.name}`} title={`data ${definition.name}`} initial={{ x: 830, y: 72 + index * 175 }} className="definition-canvas-card">
                  <code>{inductiveToScript(definition)}</code>
                  <small>Cases and induction are generated from these constructors.</small>
                </CanvasCard>
              ))}
              {state.session.definitionNames.map(definitionByName).filter((definition) => definition !== undefined).map((definition, index) => (
                <CanvasCard key={`${state.session.lessonId}-${definition.name}`} title={`${definition.name} : ${definition.type}`} initial={{ x: 830, y: 247 + index * 175 }} className="definition-canvas-card">
                  {definition.clauses.map((clause) => <code key={clause.script}>{clause.script}</code>)}
                  <small>These equations are the available computation rules.</small>
                </CanvasCard>
              ))}
              <div className="case-label">Current obligation · {currentGoal.label}</div>
              <div className={`equation-card ${busy ? "busy" : ""}`} onClick={(event) => event.stopPropagation()}>
                <Expression expression={currentGoal.left} moves={state.moves} onMove={(moveId) => void send({ moveId })} />
                <button
                  className={`equals ${closeMove === undefined ? "" : "closable"}`}
                  disabled={closeMove === undefined || busy}
                  title={closeMove === undefined ? "Keep transforming until both sides match" : "Close by reflexivity"}
                  onClick={() => closeMove !== undefined && void send({ moveId: closeMove.id })}
                >=</button>
                <Expression expression={currentGoal.right} moves={state.moves} onMove={(moveId) => void send({ moveId })} />
              </div>
              {contextualMoves.length > 0 && (
                <div
                  className="context-menu"
                  role="menu"
                  style={selection === undefined ? undefined : { left: selection.x, top: selection.y }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="context-menu-title">What do you want to do here?</div>
                  {contextualMoves.map((move) => (
                    <button role="menuitem" key={move.id} onClick={() => void send({ moveId: move.id })}>
                      <span>{move.kind === "cases" ? "⑂" : move.kind === "induction" ? "ℕ" : move.kind === "rewrite" ? "⇢" : "↳"}</span>
                      <div><strong>{move.label}</strong><small>{move.explanation}</small></div>
                    </button>
                  ))}
                  {contextualMoves.some((move) => move.dropTarget !== undefined) && <p>You can also drag this term onto a highlighted target.</p>}
                </div>
              )}
              <div className="gesture-hint">
                <span className="cursor-icon">↖</span>
                {state.moves.some((move) => move.kind === "rewrite")
                  ? "Drag IH onto the matching recursive call"
                  : analysisMove !== undefined
                    ? `Drag ${state.session.analysis?.variable} into the analysis tray`
                    : "Touch a dotted expression to apply its defining equation"}
              </div>
              <div className="canvas-help"><strong>Why this move?</strong><span>{state.moves[0]?.explanation ?? "Every local obligation is complete."}</span></div>
              <div className="move-palette">
                {state.moves.map((move) => (
                  <button key={move.id} disabled={busy} onClick={() => void send({ moveId: move.id })}>
                    <span>{move.kind === "reduce" ? "↳" : move.kind === "rewrite" ? "⇢" : move.kind === "induction" || move.kind === "cases" ? "⑂" : "✓"}</span>
                    <div><strong>{move.label}</strong><small>{move.explanation}</small></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "notebook" && (
            <div className="notebook-view">
              <div className="source-cell"><span>theorem</span> {state.session.theorem} :<br />&nbsp;&nbsp;{state.session.statement}</div>
              {state.session.goals.map((goal) => (
                <article className="proof-cell" key={goal.id}>
                  <header><span>{goal.status === "solved" ? "✓" : "○"}</span> case {goal.label}</header>
                  {goal.hypotheses.map((hypothesis) => <div className="notebook-ih" key={hypothesis.id}>IH · <Expression expression={hypothesis.left} moves={[]} onMove={() => undefined} /> = <Expression expression={hypothesis.right} moves={[]} onMove={() => undefined} /></div>)}
                  {goal.steps.map((step, index) => <div className="notebook-step" key={`${step.reason}-${index}`}><code>{step.equation}</code><small>{step.reason}</small></div>)}
                </article>
              ))}
            </div>
          )}
          {view === "script" && (
            <div className="script-view">
              <div className="script-caption">Parsed declarations and current proof state</div>
              <pre>{`${state.session.inductiveNames.map(inductiveByName).filter((definition) => definition !== undefined).map(inductiveToScript).join("\n\n")}\n\n${definitionsToScript(state.session.definitionNames)}\n\ntheorem ${state.session.theorem} :\n  ${state.session.statement}\nproof\n${currentGoal?.steps.map((step) => `  ${step.equation}  -- ${step.reason}`).join("\n") ?? ""}`}</pre>
              <p>The canvas, reducer, and this script are printed from the same AST and definition registry.</p>
            </div>
          )}
          {error !== undefined && <div className="error-toast" role="alert">{error}</div>}
        </section>
      </div>
    </main>
    </SelectionContext.Provider>
  );
}
