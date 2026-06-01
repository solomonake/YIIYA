/**
 * Cursor track — a 5-second ring buffer of cursor samples paired with the
 * component the cursor was hovering over at each timestamp.
 *
 * The deictic resolver consumes this to bind pronouns ("this", "here", "it")
 * in voice transcripts to specific component IDs by sampling the cursor at
 * the word's spoken time.
 */
import { useEffect, useMemo, useRef } from "react";

export type CursorSample = {
  t: number;             // Date.now() at sample
  x: number;             // viewport-relative
  y: number;
  componentId: string | null; // resolved from data-yiiya-component-id
};

const BUFFER_SIZE = 600;          // ~5s at 120Hz sampling
const HOVER_DWELL_MS = 300;       // settle threshold for "hover-hold" selection

export class CursorTrack {
  private buf: CursorSample[] = [];
  private idx = 0;

  push(sample: CursorSample) {
    if (this.buf.length < BUFFER_SIZE) {
      this.buf.push(sample);
    } else {
      this.buf[this.idx] = sample;
      this.idx = (this.idx + 1) % BUFFER_SIZE;
    }
  }

  /** All samples in chronological order. */
  all(): CursorSample[] {
    if (this.buf.length < BUFFER_SIZE) return [...this.buf];
    return [...this.buf.slice(this.idx), ...this.buf.slice(0, this.idx)];
  }

  /** Closest sample to time `t`. */
  sampleAt(t: number): CursorSample | null {
    let best: CursorSample | null = null;
    let bestDelta = Infinity;
    for (const s of this.all()) {
      const d = Math.abs(s.t - t);
      if (d < bestDelta) {
        bestDelta = d;
        best = s;
      }
    }
    return best;
  }

  /** Component ID under the cursor at time `t`. */
  componentAt(t: number): string | null {
    return this.sampleAt(t)?.componentId ?? null;
  }

  /** Most-frequent component ID over a time window. */
  dominantComponent(fromMs: number, toMs: number): string | null {
    const counts = new Map<string, number>();
    for (const s of this.all()) {
      if (s.t < fromMs || s.t > toMs) continue;
      if (!s.componentId) continue;
      counts.set(s.componentId, (counts.get(s.componentId) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    // Array.from for ES5 target compatibility (tsconfig.target === "es5").
    Array.from(counts.entries()).forEach(([id, n]) => {
      if (n > bestN) {
        bestN = n;
        best = id;
      }
    });
    return best;
  }
}

/**
 * React hook that installs global pointermove + element-hover listeners and
 * keeps a shared CursorTrack instance up to date.
 *
 * Returns the track ref. Mount this once at the top of the editor.
 */
export function useCursorTrack(): CursorTrack {
  const track = useMemo(() => new CursorTrack(), []);
  const lastTarget = useRef<string | null>(null);
  const lastDwellAt = useRef<number>(0);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      const componentId = target?.closest<HTMLElement>("[data-yiiya-component-id]")
        ?.dataset.yiiyaComponentId ?? null;
      const now = e.timeStamp + performance.timeOrigin;
      // Detect dwell — for the "hover-hold" gesture.
      if (componentId !== lastTarget.current) {
        lastTarget.current = componentId;
        lastDwellAt.current = now;
      }
      track.push({ t: now, x: e.clientX, y: e.clientY, componentId });
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [track]);

  return track;
}

export const TIMINGS = { HOVER_DWELL_MS } as const;
