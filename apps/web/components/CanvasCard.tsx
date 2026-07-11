"use client";

import { useRef, useState } from "react";

export function CanvasCard({
  title,
  initial,
  anchor = "left",
  className = "",
  stacked = false,
  children,
}: {
  title: React.ReactNode;
  // For anchor "left" this is the left/top offset; for "right" it is the
  // right/top offset (distance from the right edge of the offsetParent).
  initial: { x: number; y: number };
  anchor?: "left" | "right";
  className?: string;
  // Stacked cards live in-flow inside the right rail (position: static). Instead
  // of converting to absolute left/top on drag, they keep their flow slot and
  // apply the drag as a CSS `translate`, so a sideways drag keeps its horizontal
  // offset while the card still flows vertically with the column. Left-anchored
  // cards (the Local context sheet) stay absolute as before.
  stacked?: boolean;
  children: React.ReactNode;
}) {
  // A non-stacked right-anchored card floats against the right edge until the
  // user first drags it. On drag start we measure its box against the
  // offsetParent and convert to absolute left/top so it never overlaps the
  // centered equation. A stacked card instead tracks a translate offset.
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>(
    anchor === "left" && !stacked ? initial : undefined,
  );
  const [offset, setOffset] = useState<{ dx: number; dy: number } | undefined>(undefined);
  const cardRef = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | undefined>(undefined);
  const style: React.CSSProperties = stacked
    ? offset === undefined
      ? {}
      : { translate: `${offset.dx}px ${offset.dy}px` }
    : position === undefined
      ? { right: initial.x, top: initial.y }
      : { left: position.x, top: position.y };
  return (
    <section ref={cardRef} className={`canvas-card ${className}`} style={style} onClick={(event) => event.stopPropagation()}>
      <header
        className="canvas-card-handle"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          if (stacked) {
            // Anchor the drag at the current translate offset so a card already
            // nudged sideways continues smoothly from where it sits.
            const base = offset ?? { dx: 0, dy: 0 };
            drag.current = { pointerId: event.pointerId, dx: event.clientX - base.dx, dy: event.clientY - base.dy };
            return;
          }
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
          if (stacked) {
            // Free translate offset from the flow slot; the card keeps flowing
            // vertically with the column and just carries this delta.
            setOffset({ dx: event.clientX - drag.current.dx, dy: event.clientY - drag.current.dy });
            return;
          }
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
