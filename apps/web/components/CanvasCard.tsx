"use client";

import { useRef, useState } from "react";

export function CanvasCard({
  title,
  initial,
  anchor = "left",
  className = "",
  stackIndex,
  children,
}: {
  title: React.ReactNode;
  // For anchor "left" this is the left/top offset; for "right" it is the
  // right/top offset (distance from the right edge of the offsetParent).
  initial: { x: number; y: number };
  anchor?: "left" | "right";
  className?: string;
  // When set, an undragged right-anchored card takes its vertical position from
  // CSS (top derives from --card-index) so the right-rail row gap can respond to
  // the container query. Once dragged, the JS-measured left/top wins as usual.
  stackIndex?: number;
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
  const style: React.CSSProperties =
    position === undefined
      ? stackIndex === undefined
        ? { right: initial.x, top: initial.y }
        : { right: initial.x, ["--card-index" as string]: stackIndex }
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
