"use client";

import type { ProofMove } from "@touchproof/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { moveIcon } from "./moveIcon";

export function MoveContextMenu({
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
