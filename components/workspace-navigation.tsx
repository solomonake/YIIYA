"use client";
// @ts-nocheck

import { useMemo } from "react";
import { useYiiyaStore } from "@/lib/store";
import type { AssetLane } from "@/lib/asset-compiler";

const laneCopy: Record<
  AssetLane,
  { title: string; body: string; chip: string; outcome: string }
> = {
  mesh: {
    title: "Mesh Studio",
    body: "Use this for general 3D assets, stylized objects, reference-driven previews, and Blender-first handoff.",
    chip: "Preview first",
    outcome: "GLB / OBJ / pack"
  },
  cad: {
    title: "CAD Beta",
    body: "Use this for bounded hard-surface concepts with named parts, dimensions, STL, and CadQuery handoff.",
    chip: "Bounded scope",
    outcome: "CadQuery / STL / report"
  },
  scan: {
    title: "Scan Pipeline",
    body: "Use this to capture a real object, monitor coverage, and finish reconstruction off-request.",
    chip: "Worker flow",
    outcome: "Creator export pack"
  }
};

const workflow = [
  "Capture intent from speech, text, image, or scan",
  "Summarize and route into mesh, CAD, or scan",
  "Stream a fast preview before heavier work",
  "Validate handoff and open the export pack"
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
  const activeLane = useYiiyaStore((state) => state.activeLane);
  const setActiveLane = useYiiyaStore((state) => state.setActiveLane);
  const setCreationGoal = useYiiyaStore((state) => state.setCreationGoal);
  const strategyMode = useYiiyaStore((state) => state.strategyMode);
  const setStrategyMode = useYiiyaStore((state) => state.setStrategyMode);
  const objects = useYiiyaStore((state) => state.sceneObjects.length);
  const assetBrief = useYiiyaStore((state) => state.assetBrief);
  const assetSummary = useYiiyaStore((state) => state.assetSummary);
  const routePlan = useYiiyaStore((state) => state.routePlan);
  const active = useMemo(() => laneCopy[activeLane], [activeLane]);

  return (
    <aside className="yiiya-panel pointer-events-auto absolute left-5 top-20 z-30 w-[236px] p-3 font-mono text-white/62">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber">
            Asset lane
          </p>
          <p className="mt-1 text-[10px] text-white/36">
            routed creation flow
          </p>
        </div>
        <span className="border border-terminalBorder bg-white/[0.025] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/48">
          {objects}O
        </span>
      </div>

      <div className="mt-3 grid gap-1">
        {(["mesh", "cad", "scan"] as const).map((lane) => (
          <button
            key={lane}
            type="button"
            onClick={() => {
              setActiveLane(lane);
              setCreationGoal(lane === "scan" ? "scan" : "spatial");
            }}
            className="flex items-center justify-between border px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] transition"
            style={{
              borderColor: activeLane === lane ? "#EF9F27" : "#1A1A1A",
              background:
                activeLane === lane ? "rgba(239,159,39,0.1)" : "transparent",
              color: activeLane === lane ? "#F3E3C4" : "rgba(255,255,255,0.72)"
            }}
          >
            <span>{lane}</span>
            <span className="text-[10px] text-white/34">
              {lane === "mesh" ? "studio" : lane === "cad" ? "parametric" : "recon"}
            </span>
          </button>
        ))}
      </div>

      <div className="yiiya-panel-subtle yiiya-focus-line mt-3 p-3 pl-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-white/84">
            {assetBrief?.objectName ?? active.title}
          </p>
          <span className="text-[10px] uppercase tracking-[0.12em] text-amber/72">
            {assetBrief?.destination ?? active.chip}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/44">
          {assetSummary?.userVisible ?? active.body}
        </p>
        <p className="mt-3 border-t border-terminalBorder pt-2 text-[10px] uppercase tracking-[0.12em] text-white/38">
          Output:{" "}
          <span className="text-white/66">
            {routePlan
              ? routePlan.exportPack
                  .slice(0, 4)
                  .map((format) => format.toUpperCase())
                  .join(" / ")
              : active.outcome}
          </span>
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
            background: strategyMode
              ? "rgba(239,159,39,0.1)"
              : "rgba(255,255,255,0.018)",
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
