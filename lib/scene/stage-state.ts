/**
 * 3D stage lifecycle.
 *
 * Kills the "persistent blob" anti-pattern. The canvas renders nothing in
 * EMPTY; a typographic placeholder during INTENT; a dissolving particle cloud
 * during GENERATING; the real GLB in READY.
 *
 * Pure reducer + selectors — no React, no Zustand dependency. Wire it into
 * lib/store.ts as a slice.
 */
export type StageState =
  | { kind: "EMPTY" }
  | { kind: "INTENT"; promptText: string; sinceMs: number }
  | { kind: "GENERATING"; promptText: string; provider: string; progress: number; etaMs?: number; sinceMs: number }
  | { kind: "READY"; glbUrl: string; provider: string; placedAtMs: number }
  | { kind: "ERROR"; reason: string; canRetry: boolean };

export type StageEvent =
  | { type: "PROMPT_TYPED"; text: string }
  | { type: "GENERATION_STARTED"; provider: string }
  | { type: "GENERATION_PROGRESS"; progress: number; etaMs?: number }
  | { type: "GENERATION_READY"; glbUrl: string; provider: string }
  | { type: "GENERATION_FAILED"; reason: string }
  | { type: "CLEAR" }
  | { type: "RESET" };

export const initialStage: StageState = { kind: "EMPTY" };

export function reduceStage(state: StageState, event: StageEvent, now: number): StageState {
  switch (event.type) {
    case "PROMPT_TYPED": {
      if (!event.text.trim()) return { kind: "EMPTY" };
      return { kind: "INTENT", promptText: event.text, sinceMs: now };
    }
    case "GENERATION_STARTED": {
      const text = state.kind === "INTENT" ? state.promptText : "";
      return {
        kind: "GENERATING",
        promptText: text,
        provider: event.provider,
        progress: 0,
        sinceMs: now
      };
    }
    case "GENERATION_PROGRESS": {
      if (state.kind !== "GENERATING") return state;
      return { ...state, progress: event.progress, etaMs: event.etaMs };
    }
    case "GENERATION_READY":
      return { kind: "READY", glbUrl: event.glbUrl, provider: event.provider, placedAtMs: now };
    case "GENERATION_FAILED":
      return { kind: "ERROR", reason: event.reason, canRetry: true };
    case "CLEAR":
    case "RESET":
      return { kind: "EMPTY" };
    default:
      return state;
  }
}

// -----------------------------------------------------------------------------
// Selectors for renderers
// -----------------------------------------------------------------------------
export function isMounted(state: StageState): boolean {
  return state.kind !== "EMPTY";
}

export function shouldShowTypographic(state: StageState): boolean {
  return state.kind === "INTENT" || state.kind === "GENERATING";
}

export function placeholderText(state: StageState): string {
  if (state.kind === "INTENT") return state.promptText;
  if (state.kind === "GENERATING") return state.promptText;
  return "";
}

export function particleDensity(state: StageState): number {
  if (state.kind !== "GENERATING") return 0;
  return Math.max(0, Math.min(1, 1 - state.progress));
}
