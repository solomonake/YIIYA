"use client";

/**
 * Bridge between the speech interpreter (which parses "make this red") and
 * the live three.js scene (which owns the mesh + selected region). Same
 * register/consume pattern as lib/scene/turntable-recorder.ts — the canvas
 * registers handlers on mount; the interpreter calls them without ever
 * touching three directly.
 */

export type RegionEditHandlers = {
  /** True while a region is selected on the active mesh. */
  hasSelection: () => boolean;
  /** Paint the selected region with a hex color. Returns false if nothing selected. */
  applyColor: (hex: string) => boolean;
  /** Clear selection highlight + any preview tint. */
  clearSelection: () => void;
};

let handlers: RegionEditHandlers | null = null;

export function registerRegionEditHandlers(h: RegionEditHandlers | null): void {
  handlers = h;
}

export function getRegionEditHandlers(): RegionEditHandlers | null {
  return handlers;
}
