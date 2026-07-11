"use client";

import type { Lesson, ProofMove } from "@touchproof/core";
import { useState } from "react";
import { moveIcon } from "./moveIcon";

/** The bottom-center move band: every applicable move as a compact chip, with
 * the next-lesson chip taking over once the lesson is solved. Each chip shows
 * icon + label; the explanation appears as an instant themed tooltip on
 * hover/focus (see .move-tip in styles.css). The tooltip is driven by the same
 * pointer/focus events as the move preview (a `tip-open` class), not by CSS
 * :hover alone — recomputed hover state can be lost across popup open/dismiss
 * cycles, but these events keep firing. */
export function MovePalette({
  moves,
  busy,
  solved,
  nextLesson,
  onMove,
  onStartLesson,
  previewProps,
}: {
  moves: readonly ProofMove[];
  busy: boolean;
  solved: boolean;
  nextLesson: Lesson | undefined;
  onMove: (moveId: string) => void;
  onStartLesson: (lessonId: string) => void;
  previewProps: (move: ProofMove) => {
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
  };
}) {
  const [tipId, setTipId] = useState<string>();
  return (
    <div className="move-palette">
      {solved && nextLesson !== undefined && (
        <button
          className="next-lesson"
          aria-disabled={busy}
          onClick={() => { if (!busy) onStartLesson(nextLesson.id); }}
        >
          <span>→</span>
          <div><strong>Next lesson</strong><small>{nextLesson.title}</small></div>
        </button>
      )}
      {moves.map((move) => {
        const preview = previewProps(move);
        return (
          <button
            key={move.id}
            className={`move-chip${tipId === move.id ? " tip-open" : ""}`}
            /* aria-disabled + a click guard rather than the `disabled` attribute:
               a truly-disabled button stops firing hover/pointer events, so after
               a click flips `busy` and back the chip's tooltip would only return
               after the pointer left and re-entered. Keeping the chip enabled
               preserves hover across the busy toggle and keeps it focusable. */
            aria-disabled={busy}
            onClick={() => { if (!busy) onMove(move.id); }}
            onPointerEnter={() => { setTipId(move.id); preview.onPointerEnter?.(); }}
            onPointerLeave={() => { setTipId(undefined); preview.onPointerLeave?.(); }}
            onFocus={() => { setTipId(move.id); preview.onFocus?.(); }}
            onBlur={() => { setTipId(undefined); preview.onBlur?.(); }}
          >
            <span>{moveIcon(move)}</span>
            <strong>{move.label}</strong>
            <span className="move-tip" role="tooltip">{move.explanation}</span>
          </button>
        );
      })}
    </div>
  );
}
