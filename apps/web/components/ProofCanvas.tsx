"use client";

import {
  definitionByName,
  inductiveByName,
  type Lesson,
  type ProofMove,
} from "@touchproof/core";
import { clauseToSegments, inductiveToSegments } from "@/lib/programDoc";
import type { ProofSnapshot } from "@/lib/proof/browserProofBackend";
import { dropMove } from "@/lib/viewModel";
import { CanvasCard } from "./CanvasCard";
import { DefinitionCard } from "./DefinitionCard";
import { EquationCard } from "./EquationCard";
import { Expression } from "./Expression";
import { MoveContextMenu } from "./MoveContextMenu";
import { MovePalette } from "./MovePalette";
import { TokenSpans } from "./TokenSpans";

// Definition-card code column budget: the card body is 285px wide minus
// 2 x 11px padding = 263px; at 12px ui-monospace (~0.6em = 7.2px advance)
// that is ~36 characters, with the pretty-printer breaking anything longer.
const DEFINITION_CARD_CODE_COLUMNS = 36;

type Goal = ProofSnapshot["session"]["goals"][number];

/** The visual drafting board: floating context + definition cards, the centered
 * equation sheet, the gesture hint, why-card, move palette and context menu.
 * All state is owned by ProofWorkspace and threaded in through props. */
export function ProofCanvas({
  state,
  currentGoal,
  moves,
  preview,
  analysisMove,
  busy,
  solved,
  closeMove,
  nextLesson,
  selection,
  contextualMoves,
  onSend,
  onSelectHandle,
  onCloseMenu,
  onPreview,
  previewProps,
  onStartLesson,
}: {
  state: ProofSnapshot;
  currentGoal: Goal;
  moves: readonly ProofMove[];
  preview: ProofMove | undefined;
  analysisMove: ProofMove | undefined;
  busy: boolean;
  solved: boolean;
  closeMove: ProofMove | undefined;
  nextLesson: Lesson | undefined;
  selection: { handle: string; x: number; y: number } | undefined;
  contextualMoves: readonly ProofMove[];
  onSend: (moveId: string) => void;
  onSelectHandle: (handle: string, point: { x: number; y: number }) => void;
  onCloseMenu: () => void;
  onPreview: (move?: ProofMove) => void;
  previewProps: (move: ProofMove) => Record<string, () => void>;
  onStartLesson: (lessonId: string) => void;
}) {
  const inductives = state.session.inductiveNames.map(inductiveByName).filter((definition) => definition !== undefined);
  const definitions = state.session.definitionNames.map(definitionByName).filter((definition) => definition !== undefined);

  return (
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
            className={`hypothesis-card ${moves.some((move) => move.handle === hypothesis.id) ? "tappable" : ""} ${preview?.handle === hypothesis.id ? "preview-target" : ""}`}
            draggable
            key={hypothesis.id}
            role={moves.some((move) => move.handle === hypothesis.id) ? "button" : undefined}
            tabIndex={moves.some((move) => move.handle === hypothesis.id) ? 0 : undefined}
            title="Click for rewrite options, or drag onto a matching expression"
            onClick={(event) => {
              if (!moves.some((move) => move.handle === hypothesis.id)) return;
              event.stopPropagation();
              onSelectHandle(hypothesis.id, { x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (!moves.some((move) => move.handle === hypothesis.id) || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              onSelectHandle(hypothesis.id, { x: bounds.right, y: bounds.bottom });
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
              const move = dropMove(moves, handle, "analysis-zone");
              if (move !== undefined) onSend(move.id);
            }}
          >
            <strong>{analysisMove.kind === "cases" ? "Analyze this value" : "Use induction"}</strong>
            {/* Drag is pointer-only; on touch (CSS ≤800px) swap to the tap route. */}
            <span className="hint-drag">Drag <code>{analysisMove.variable}</code> here—or click it and choose the action.</span>
            <span className="hint-tap">Tap <code>{analysisMove.variable}</code> and choose the action.</span>
          </div>
        )}
      </CanvasCard>
      {/* Right rail: inductive then definition sheets, stacked from the top.
          Each card's vertical slot comes from its stackIndex (CSS var), so the
          row gap can tighten under the container query without recomputing
          offsets in JS. First card opens by default; the rest collapse in tight
          mode. Direct children of .visual-view to keep the staggered reveal and
          the drag offsetParent intact. */}
      {inductives.map((definition, index) => (
        <DefinitionCard
          key={`${state.session.lessonId}-${definition.name}`}
          cardKey={`${state.session.lessonId}-${definition.name}`}
          title={`data ${definition.name}`}
          anchor="right"
          initial={{ x: 24, y: 72 }}
          stackIndex={index}
          defaultOpen={false}
          note="Cases and induction are generated from these constructors."
        >
          <code><TokenSpans segments={inductiveToSegments(definition, DEFINITION_CARD_CODE_COLUMNS)} /></code>
        </DefinitionCard>
      ))}
      {definitions.map((definition, index) => (
        <DefinitionCard
          key={`${state.session.lessonId}-${definition.name}`}
          cardKey={`${state.session.lessonId}-${definition.name}`}
          title={`${definition.name} : ${definition.type}`}
          anchor="right"
          initial={{ x: 24, y: 72 }}
          stackIndex={inductives.length + index}
          defaultOpen={false}
          note="These equations are the available computation rules."
        >
          {definition.clauses.map((clause) => <code key={clause.script}><TokenSpans segments={clauseToSegments(definition.name, clause, DEFINITION_CARD_CODE_COLUMNS)} /></code>)}
        </DefinitionCard>
      ))}
      <div className="case-label">Current obligation · {currentGoal.label}</div>
      <EquationCard
        left={currentGoal.left}
        right={currentGoal.right}
        moves={moves}
        closeMove={closeMove}
        busy={busy}
        solved={solved}
        generalizedVariables={state.session.generalizedVariables}
        onMove={onSend}
      />
      {selection !== undefined && contextualMoves.length > 0 && (
        <MoveContextMenu
          moves={contextualMoves}
          anchor={{ x: selection.x, y: selection.y }}
          onPick={onSend}
          onClose={onCloseMenu}
          onPreview={onPreview}
        />
      )}
      <div className="gesture-hint">
        <span className="cursor-icon">{solved ? "✓" : "↖"}</span>
        {solved ? (
          "Proved and kernel-checked. Read it back in the Notebook, or continue."
        ) : moves.some((move) => move.kind === "rewrite") ? (
          /* Drag is pointer-only; the tap route (tap the IH card -> menu) covers
             the same move on touch, so show a tap-worded hint on mobile where
             the CSS ≤800px hides .hint-drag and reveals .hint-tap. */
          <>
            <span className="hint-drag">Drag IH onto the matching recursive call</span>
            <span className="hint-tap">Tap IH, then tap the matching recursive call</span>
          </>
        ) : analysisMove !== undefined ? (
          <>
            <span className="hint-drag">Drag {analysisMove.variable} into the analysis tray</span>
            <span className="hint-tap">Tap {analysisMove.variable}, then choose the action</span>
          </>
        ) : (
          "Touch a dotted expression to apply its defining equation"
        )}
      </div>
      {!solved && <div className="canvas-help"><strong>Why this move?</strong><span>{moves[0]?.explanation ?? "Every local obligation is complete."}</span></div>}
      <MovePalette
        moves={moves}
        busy={busy}
        solved={solved}
        nextLesson={nextLesson}
        onMove={onSend}
        onStartLesson={onStartLesson}
        previewProps={previewProps}
      />
    </div>
  );
}
