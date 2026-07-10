"use client";

import type { ProgramExpr, ProofMove, ProofSession } from "@touchproof/core";
import { useEffect, useMemo, useState } from "react";
import { dropMove, movesForHandle, proofProgress } from "@/lib/viewModel";

type ApiState = { session: ProofSession; moves: ProofMove[] };
type View = "visual" | "notebook";

function Expression({
  expression,
  moves,
  onMove,
}: {
  expression: ProgramExpr;
  moves: readonly ProofMove[];
  onMove: (moveId: string) => void;
}) {
  const fromHere = movesForHandle(moves, expression.id);
  const tapMove = fromHere.find((move) => move.dropTarget === undefined && move.kind === "reduce");
  const isDropTarget = moves.some((move) => move.dropTarget === expression.id);

  const content = (() => {
    if (expression.kind === "var") return expression.name;
    if (expression.kind === "ctor") {
      if (expression.name === "nil") return "[]";
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
    return <><span className="function-name">{expression.name}</span>{expression.args.map((arg) => <span className="argument" key={arg.id}><Expression expression={arg} moves={moves} onMove={onMove} /></span>)}</>;
  })();

  return (
    <span
      className={`expression ${fromHere.length > 0 ? "movable" : ""} ${tapMove !== undefined ? "tappable" : ""} ${isDropTarget ? "drop-target" : ""}`}
      draggable={fromHere.length > 0}
      role={tapMove === undefined ? undefined : "button"}
      tabIndex={tapMove === undefined ? undefined : 0}
      title={tapMove?.explanation ?? fromHere[0]?.explanation}
      onClick={(event) => {
        if (tapMove === undefined) return;
        event.stopPropagation();
        onMove(tapMove.id);
      }}
      onKeyDown={(event) => {
        if (tapMove !== undefined && (event.key === "Enter" || event.key === " ")) onMove(tapMove.id);
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

  useEffect(() => {
    fetch("/api/proof").then(async (response) => {
      if (!response.ok) throw new Error("Could not start the proof session.");
      return response.json() as Promise<ApiState>;
    }).then(setState).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not start TouchProof."));
  }, []);

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
      setState(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proof step was rejected.");
    } finally {
      setBusy(false);
    }
  };

  const currentGoal = state?.session.goals.find((goal) => goal.id === state.session.focusedGoalId);
  const progress = useMemo(() => state === undefined ? { solved: 0, total: 0 } : proofProgress(state.session), [state]);
  const inductionMove = state?.moves.find((move) => move.kind === "induction");

  if (state === undefined) {
    return <main className="loading"><div className="brand-mark">T</div><p>{error ?? "Preparing the proof…"}</p></main>;
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">T</span><span>TouchProof</span><small>Learn by transforming</small></div>
        <div className="view-switch" aria-label="Proof view">
          <button className={view === "visual" ? "active" : ""} onClick={() => setView("visual")}>Visual</button>
          <button className={view === "notebook" ? "active" : ""} onClick={() => setView("notebook")}>Notebook</button>
        </div>
        <div className={`kernel-badge ${state.session.kernelStatus}`}>
          <span />{state.session.kernelStatus === "checked" ? "Kernel checked" : "Checking each move"}
        </div>
      </header>

      <section className="lesson-strip">
        <div><span className="eyebrow">Lesson 7 · Induction</span><h1>Map preserves composition</h1></div>
        <p>Transform both sides until they are visibly the same. Touch a highlighted call to unfold it.</p>
        <div className="progress"><strong>{progress.solved}/{progress.total}</strong><span>obligations</span></div>
      </section>

      <div className="body-grid">
        <aside className="context-panel">
          <h2>In this case</h2>
          <div className="context-list">
            {currentGoal?.context.map((binding) => <code key={binding}>{binding}</code>)}
          </div>
          {currentGoal?.hypotheses.map((hypothesis) => (
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
              <small>Drag onto a matching expression</small>
            </div>
          ))}
          {inductionMove !== undefined && (
            <div
              id="induction-zone"
              className="induction-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const handle = event.dataTransfer.getData("application/x-touchproof-handle");
                const move = dropMove(state.moves, handle, "induction-zone");
                if (move !== undefined) void send({ moveId: move.id });
              }}
            >
              <strong>Analyze this list</strong>
              <span>Drag <code>l</code> here to create the cases you need.</span>
            </div>
          )}
          <div className="why-card"><span>Why is this valid?</span><p>{state.moves[0]?.explanation ?? "This obligation is complete."}</p></div>
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
              <div className="case-label">Current obligation · {currentGoal.label}</div>
              <div className={`equation-card ${busy ? "busy" : ""}`}>
                <Expression expression={currentGoal.left} moves={state.moves} onMove={(moveId) => void send({ moveId })} />
                <span className="equals">=</span>
                <Expression expression={currentGoal.right} moves={state.moves} onMove={(moveId) => void send({ moveId })} />
              </div>
              <div className="gesture-hint">
                <span className="cursor-icon">↖</span>
                {state.moves.some((move) => move.kind === "rewrite")
                  ? "Drag IH onto the matching recursive call"
                  : inductionMove !== undefined
                    ? "Drag l into the analysis tray"
                    : "Touch a dotted expression to apply its defining equation"}
              </div>
              <div className="move-palette">
                {state.moves.map((move) => (
                  <button key={move.id} disabled={busy} onClick={() => void send({ moveId: move.id })}>
                    <span>{move.kind === "reduce" ? "↳" : move.kind === "rewrite" ? "⇢" : move.kind === "induction" ? "⑂" : "✓"}</span>
                    <div><strong>{move.label}</strong><small>{move.explanation}</small></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "notebook" && (
            <div className="notebook-view">
              <div className="source-cell"><span>theorem</span> map_comp (f g : A → A) (l : List A) :<br />&nbsp;&nbsp;map (f ∘ g) l = map f (map g l)</div>
              {state.session.goals.map((goal) => (
                <article className="proof-cell" key={goal.id}>
                  <header><span>{goal.status === "solved" ? "✓" : "○"}</span> case {goal.label}</header>
                  {goal.hypotheses.map((hypothesis) => <div className="notebook-ih" key={hypothesis.id}>IH · map (f ∘ g) xs = map f (map g xs)</div>)}
                  {goal.steps.map((step, index) => <div className="notebook-step" key={`${step.reason}-${index}`}><code>{step.equation}</code><small>{step.reason}</small></div>)}
                </article>
              ))}
            </div>
          )}
          {error !== undefined && <div className="error-toast" role="alert">{error}</div>}
        </section>
      </div>
    </main>
  );
}
