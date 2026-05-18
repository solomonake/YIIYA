"use client";

import { useMemo } from "react";
import { useYiiyaStore, type CanvasMode } from "@/lib/store";

const modeCopy: Record<
  CanvasMode,
  { title: string; body: string; chip: string; outcome: string }
> = {
  WEB: {
    title: "Web Canvas",
    body: "Shape the landing page first. Hover or circle a section while speaking to change copy, spacing, color, or layout in place.",
    chip: "Primary",
    outcome: "Publishable page"
  },
  "3D": {
    title: "Hero Object",
    body: "Build one memorable product object. Use Mold Lab for shape, material, motion, and export without distracting from the page.",
    chip: "Core",
    outcome: "Spatial hero"
  },
  HYBRID: {
    title: "Compose",
    body: "Use only when the page and hero object need to be reviewed together before publishing.",
    chip: "Review",
    outcome: "Web + object"
  }
};

const modeLabels: Record<CanvasMode, { label: string; detail: string }> = {
  WEB: { label: "Web", detail: "page" },
  "3D": { label: "3D Hero", detail: "object" },
  HYBRID: { label: "Compose", detail: "review" }
};

const workflow = [
  "Answer the four direction checks",
  "Generate or refine the web page",
  "Create one 3D hero object",
  "Publish and export"
];

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
  const setCreationGoal = useYiiyaStore((state) => state.setCreationGoal);
  const strategyMode = useYiiyaStore((state) => state.strategyMode);
  const setStrategyMode = useYiiyaStore((state) => state.setStrategyMode);
  const sections = useYiiyaStore((state) => state.sections.length);
  const objects = useYiiyaStore((state) => state.sceneObjects.length);

  const active = useMemo(() => modeCopy[canvasMode], [canvasMode]);

  return (
    <aside className="yiiya-panel pointer-events-auto absolute left-5 top-20 z-30 w-[224px] p-3 font-mono text-white/62">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber">
            Build path
          </p>
          <p className="mt-1 text-[10px] text-white/36">controlled creation flow</p>
        </div>
        <span className="border border-terminalBorder bg-white/[0.025] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/48">
          {sections}S · {objects}O
        </span>
      </div>

      <div className="mt-3 grid gap-1">
        {(["WEB", "3D", "HYBRID"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setCanvasMode(mode);
              if (mode === "WEB") {
                setCreationGoal("web");
              }
              if (mode === "3D") {
                setCreationGoal("spatial");
              }
            }}
            className="flex items-center justify-between border px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] transition"
            style={{
              borderColor: canvasMode === mode ? "#EF9F27" : "#1A1A1A",
              background: canvasMode === mode ? "rgba(239,159,39,0.1)" : "transparent",
              color: canvasMode === mode ? "#F3E3C4" : "rgba(255,255,255,0.72)"
            }}
          >
            <span>{modeLabels[mode].label}</span>
            <span className="text-[10px] text-white/34">
              {modeLabels[mode].detail}
            </span>
          </button>
        ))}
      </div>

      <div className="yiiya-panel-subtle yiiya-focus-line mt-3 p-3 pl-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-white/84">{active.title}</p>
          <span className="text-[10px] uppercase tracking-[0.12em] text-amber/72">
            {active.chip}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/44">{active.body}</p>
        <p className="mt-3 border-t border-terminalBorder pt-2 text-[10px] uppercase tracking-[0.12em] text-white/38">
          Output: <span className="text-white/66">{active.outcome}</span>
        </p>
      </div>

      <ol className="mt-3 grid gap-1.5 text-[10px] leading-relaxed text-white/42">
        {workflow.map((item, index) => (
          <li key={item} className="flex gap-2">
            <span className="text-amber/70">{index + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={onToggleProjects}
          className="yiiya-micro-button h-9 text-[10px] font-bold uppercase tracking-[0.14em] text-white/62"
        >
          Projects
        </button>
        <button
          type="button"
          onClick={onToggleMap}
          className="yiiya-micro-button h-9 text-[10px] font-bold uppercase tracking-[0.14em] text-white/62"
        >
          Map
        </button>
        <button
          type="button"
          onClick={() => setStrategyMode(!strategyMode)}
          className="h-9 border text-[10px] font-bold uppercase tracking-[0.14em] transition"
          style={{
            borderColor: strategyMode ? "#EF9F27" : "#1A1A1A",
            background: strategyMode ? "rgba(239,159,39,0.1)" : "rgba(255,255,255,0.018)",
            color: strategyMode ? "#EF9F27" : "rgba(255,255,255,0.62)"
          }}
        >
          Strategy
        </button>
        <button
          type="button"
          onClick={onNewProject}
          className="yiiya-micro-button h-9 text-[10px] font-bold uppercase tracking-[0.14em] text-white/62"
        >
          New
        </button>
      </div>
    </aside>
  );
}
