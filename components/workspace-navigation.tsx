"use client";

import { useMemo } from "react";
import { useYiiyaStore, type CanvasMode } from "@/lib/store";

const modeCopy: Record<
  CanvasMode,
  { title: string; body: string; chip: string }
> = {
  WEB: {
    title: "Website Builder",
    body: "Use speech, screenshots, or URLs to shape the landing page without a 3D object sitting on top.",
    chip: "Screenshot-first"
  },
  "3D": {
    title: "3D Studio",
    body: "Focus on objects, materials, export, and phone capture with the cleanest spatial workspace.",
    chip: "Object-first"
  },
  HYBRID: {
    title: "Power Mode",
    body: "Blend website and 3D only when you intentionally want both layers working together.",
    chip: "Merged"
  }
};

export function WorkspaceNavigation({
  onToggleProjects,
  onToggleMap,
  onNewProject
}: {
  onToggleProjects: () => void;
  onToggleMap: () => void;
  onNewProject: () => void;
}) {
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const setCanvasMode = useYiiyaStore((state) => state.setCanvasMode);
  const strategyMode = useYiiyaStore((state) => state.strategyMode);
  const setStrategyMode = useYiiyaStore((state) => state.setStrategyMode);
  const sections = useYiiyaStore((state) => state.sections.length);
  const objects = useYiiyaStore((state) => state.sceneObjects.length);

  const active = useMemo(() => modeCopy[canvasMode], [canvasMode]);

  return (
    <aside className="pointer-events-auto absolute left-5 top-16 z-30 w-[198px] border border-terminalBorder bg-[#050505]/92 p-3 font-mono text-white/62 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber">
            Navigate
          </p>
          <p className="mt-1 text-[10px] text-white/34">mode + workspace</p>
        </div>
        <span className="border border-terminalBorder px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/48">
          {sections}S · {objects}O
        </span>
      </div>

      <div className="mt-3 grid gap-1">
        {(["WEB", "3D", "HYBRID"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setCanvasMode(mode)}
            className="flex items-center justify-between border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] transition"
            style={{
              borderColor: canvasMode === mode ? "#EF9F27" : "#1A1A1A",
              background: canvasMode === mode ? "rgba(239,159,39,0.08)" : "transparent",
              color: canvasMode === mode ? "#F3E3C4" : "rgba(255,255,255,0.72)"
            }}
          >
            <span>{mode === "HYBRID" ? "POWER" : mode}</span>
            <span className="text-[10px] text-white/34">
              {mode === "WEB" ? "site" : mode === "3D" ? "object" : "merge"}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 border border-terminalBorder bg-white/[0.025] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-white/84">{active.title}</p>
          <span className="text-[10px] uppercase tracking-[0.12em] text-amber/72">
            {active.chip}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/44">{active.body}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={onToggleProjects}
          className="h-9 border border-terminalBorder text-[10px] font-bold uppercase tracking-[0.14em] text-white/62 transition hover:border-amber/70 hover:text-amber"
        >
          Projects
        </button>
        <button
          type="button"
          onClick={onToggleMap}
          className="h-9 border border-terminalBorder text-[10px] font-bold uppercase tracking-[0.14em] text-white/62 transition hover:border-amber/70 hover:text-amber"
        >
          Map
        </button>
        <button
          type="button"
          onClick={() => setStrategyMode(!strategyMode)}
          className="h-9 border text-[10px] font-bold uppercase tracking-[0.14em] transition"
          style={{
            borderColor: strategyMode ? "#EF9F27" : "#1A1A1A",
            color: strategyMode ? "#EF9F27" : "rgba(255,255,255,0.62)"
          }}
        >
          Strategy
        </button>
        <button
          type="button"
          onClick={onNewProject}
          className="h-9 border border-terminalBorder text-[10px] font-bold uppercase tracking-[0.14em] text-white/62 transition hover:border-amber/70 hover:text-amber"
        >
          New
        </button>
      </div>
    </aside>
  );
}
