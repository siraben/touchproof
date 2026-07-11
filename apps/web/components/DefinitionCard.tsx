"use client";

import { useState } from "react";
import { CanvasCard } from "./CanvasCard";

/** A definition / inductive sheet in the right rail. Cards live in-flow inside
 * the stacked rail column and render expanded by default in every mode; the
 * chevron collapses one to its header alone, pushing the cards below it up
 * (and back down when re-expanded). Still draggable in either state (the header
 * is the CanvasCard drag handle, which offsets the card via CSS translate).
 * Collapse state is local UI, reset per lesson by the `cardKey`-derived React
 * key upstream. */
export function DefinitionCard({
  cardKey,
  title,
  anchor,
  initial,
  defaultOpen = true,
  note,
  children,
}: {
  cardKey: string;
  title: string;
  anchor: "left" | "right";
  initial: { x: number; y: number };
  defaultOpen?: boolean;
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
      ><span className="definition-card-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span></button>
    </>
  );
  return (
    <CanvasCard
      key={cardKey}
      title={heading}
      anchor={anchor}
      initial={initial}
      stacked
      className={`definition-canvas-card ${open ? "is-open" : "is-collapsed"}`}
    >
      {children}
      <small>{note}</small>
    </CanvasCard>
  );
}
