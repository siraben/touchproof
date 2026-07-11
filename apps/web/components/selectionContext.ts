"use client";

import { createContext, useContext } from "react";

/** Ambient selection/preview state threaded to every interactive expression.
 * Owned by ProofWorkspace; consumed by Expression and its operands. */
export interface Selection {
  selectedHandle?: string;
  previewHandle?: string;
  previewTarget?: string;
  select: (handle?: string, point?: { x: number; y: number }) => void;
}

export const SelectionContext = createContext<Selection>({ select: () => undefined });

export const useSelection = (): Selection => useContext(SelectionContext);
