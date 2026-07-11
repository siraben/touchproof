"use client";

import { useState } from "react";
import { CanvasCard } from "./CanvasCard";

/** A definition / inductive sheet in the right rail. In roomy mode it renders
 * expanded like any canvas card; in tight mode (container query) the body
 * collapses to just the header, and a chevron toggles it. Still draggable in
 * either state (the header is the CanvasCard drag handle). Collapse state is
 * local UI, reset per lesson by the `cardKey`-derived React key upstream. */
export function DefinitionCard({
  cardKey,
  title,
  anchor,
  initial,
  stackIndex,
  defaultOpen,
  note,
  children,
}: {
  cardKey: string;
  title: string;
  anchor: "left" | "right";
  initial: { x: number; y: number };
  stackIndex: number;
  defaultOpen: boolean;
  note: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = (
    <>
      <span className="definition-card-title">{title}</span>
      <button
        type="button"
        className="definition-card-toggle"
        aria-expanded={open}
        aria-label={open ? "Collapse definition" : "Expand definition"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >{open ? "▾" : "▸"}</button>
    </>
  );
  return (
    <CanvasCard
      key={cardKey}
      title={heading}
      anchor={anchor}
      initial={initial}
      stackIndex={stackIndex}
      className={`definition-canvas-card ${open ? "is-open" : "is-collapsed"}`}
    >
      {children}
      <small>{note}</small>
    </CanvasCard>
  );
}
