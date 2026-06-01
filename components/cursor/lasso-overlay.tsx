"use client";

/**
 * Lasso overlay — captures pointer drag, draws a hairline trail behind the
 * cursor, and emits a `select` event with picked component IDs.
 *
 * Visual rules (anti-slop):
 *   - No glow, no comet, no circle around the cursor.
 *   - 1px hairline (var(--yiiya-fg)) that trails 200ms behind, fades to 0
 *     over the next 400ms after release.
 *
 * Wire it into the editor surface once:
 *   <LassoOverlay onSelect={(ids) => useYiiyaStore.setState({ selectedIds: ids })} />
 */
import { useEffect, useRef, useState } from "react";
import { pickComponents, type Point, type Rect } from "@/lib/cursor/lasso";

export type LassoOverlayProps = {
  /** Called with picked component IDs when the user releases the pointer. */
  onSelect: (ids: string[]) => void;
  /** Override the global trail color (default: --yiiya-fg). */
  color?: string;
};

export function LassoOverlay({ onSelect, color }: LassoOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  const pathRef = useRef<Point[]>([]);
  const fadingRef = useRef<{ path: Point[]; startedAt: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    let raf = 0;
    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const computed = getComputedStyle(document.documentElement);
      const stroke = color ?? (computed.getPropertyValue("--yiiya-fg").trim() || "#F2F2F2");
      ctx.strokeStyle = stroke;

      if (active && pathRef.current.length >= 2) {
        ctx.globalAlpha = 1;
        traceCanvas(ctx, pathRef.current);
      }
      if (fadingRef.current) {
        const elapsed = performance.now() - fadingRef.current.startedAt;
        const a = Math.max(0, 1 - elapsed / 400);
        if (a <= 0) {
          fadingRef.current = null;
        } else {
          ctx.globalAlpha = a;
          traceCanvas(ctx, fadingRef.current.path);
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, color]);

  useEffect(() => {
    function down(e: PointerEvent) {
      // Only trigger on primary button + Shift (so normal drags still work).
      if (!e.shiftKey || e.button !== 0) return;
      setActive(true);
      pathRef.current = [{ x: e.clientX, y: e.clientY }];
    }
    function move(e: PointerEvent) {
      if (!active) return;
      const last = pathRef.current[pathRef.current.length - 1];
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 2) return;
      pathRef.current.push({ x: e.clientX, y: e.clientY });
    }
    function up() {
      if (!active) return;
      setActive(false);
      const path = pathRef.current;
      pathRef.current = [];
      fadingRef.current = { path: [...path], startedAt: performance.now() };

      // Resolve selection against visible YIIYA components.
      const candidates = collectCandidates();
      const ids = pickComponents(candidates, path);
      onSelect(ids);
    }
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [active, onSelect]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999
      }}
    />
  );
}

function traceCanvas(ctx: CanvasRenderingContext2D, path: ReadonlyArray<Point>) {
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
}

function collectCandidates(): Array<{ id: string; box: Rect }> {
  const els = document.querySelectorAll<HTMLElement>("[data-yiiya-component-id]");
  const out: Array<{ id: string; box: Rect }> = [];
  els.forEach((el) => {
    const id = el.dataset.yiiyaComponentId;
    if (!id) return;
    const r = el.getBoundingClientRect();
    out.push({ id, box: { x: r.left, y: r.top, w: r.width, h: r.height } });
  });
  return out;
}
