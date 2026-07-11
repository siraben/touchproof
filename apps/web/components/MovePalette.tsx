"use client";

import type { Lesson, ProofMove } from "@touchproof/core";
import { moveIcon } from "./moveIcon";

/** The bottom-center move band: every applicable move as a compact chip, with
 * the next-lesson chip taking over once the lesson is solved. Each chip shows
 * icon + label; the explanation appears as an instant themed tooltip on
 * hover/focus (see .move-tip in styles.css). */
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
  previewProps: (move: ProofMove) => Record<string, () => void>;
}) {
  return (
    <div className="move-palette">
      {solved && nextLesson !== undefined && (
        <button className="next-lesson" disabled={busy} onClick={() => onStartLesson(nextLesson.id)}>
          <span>→</span>
          <div><strong>Next lesson</strong><small>{nextLesson.title}</small></div>
        </button>
      )}
      {moves.map((move) => (
        <button
          key={move.id}
          className="move-chip"
          disabled={busy}
          onClick={() => onMove(move.id)}
          {...previewProps(move)}
        >
          <span>{moveIcon(move)}</span>
          <strong>{move.label}</strong>
          <span className="move-tip" role="tooltip">{move.explanation}</span>
        </button>
      ))}
    </div>
  );
}
