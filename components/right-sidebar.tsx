"use client";

import { useEffect, useMemo, useState } from "react";
import { useYiiyaStore } from "@/lib/store";

const typeLabel = {
  site: "Site",
  scene: "Scene",
  mesh: "Mesh",
  light: "Light",
  section: "Section"
} as const;

type SidebarTab = "brief" | "feed" | "layers";

export function RightSidebar() {
  const collapsed = useYiiyaStore((state) => state.sidebarCollapsed);
  const logs = useYiiyaStore((state) => state.logs);
  const layers = useYiiyaStore((state) => state.layers);
  const sections = useYiiyaStore((state) => state.sections);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const activeBrief = useYiiyaStore((state) => state.activeBrief);
  const lastFallbackPath = useYiiyaStore((state) => state.lastFallbackPath);
  const toggleSidebar = useYiiyaStore((state) => state.toggleSidebar);
  const [tab, setTab] = useState<SidebarTab>("brief");

  const visibleTabs = useMemo<SidebarTab[]>(
    () => (canvasMode === "WEB" ? ["brief", "feed"] : ["brief", "feed", "layers"]),
    [canvasMode]
  );
  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      setTab("brief");
    }
  }, [tab, visibleTabs]);
  const recentLogs = logs.slice(-8).reverse();
  const sectionCount = sections.length;
  const objectCount = sceneObjects.length;
  const layerCount = layers.length;

  return (
    <aside
      className="absolute right-0 top-0 z-20 flex h-full flex-col border-l border-terminalBorder bg-ink/95 backdrop-blur-xl transition-[width] duration-200"
      style={{ width: collapsed ? 44 : 260 }}
    >
      <button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleSidebar}
        className="flex h-10 shrink-0 items-center justify-center border-b border-terminalBorder text-[11px] text-white/45 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-inset focus:ring-amber"
      >
        <span aria-hidden="true">{collapsed ? "<" : ">"}</span>
      </button>

      {collapsed ? null : (
        <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
          <section className="shrink-0 border border-terminalBorder bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/44">
                Inspector
              </p>
              <span className="text-[10px] uppercase tracking-[0.14em] text-amber/75">
                {canvasMode === "HYBRID" ? "POWER" : canvasMode}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="border border-terminalBorder py-2">
                <p className="text-[10px] text-white/36">Sections</p>
                <p className="mt-1 text-sm font-semibold text-white/82">{sectionCount}</p>
              </div>
              <div className="border border-terminalBorder py-2">
                <p className="text-[10px] text-white/36">Objects</p>
                <p className="mt-1 text-sm font-semibold text-white/82">{objectCount}</p>
              </div>
              <div className="border border-terminalBorder py-2">
                <p className="text-[10px] text-white/36">Layers</p>
                <p className="mt-1 text-sm font-semibold text-white/82">{layerCount}</p>
              </div>
            </div>
          </section>

          <div className="mt-4 flex shrink-0 gap-1 border border-terminalBorder bg-white/[0.02] p-1">
            {visibleTabs.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className="flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition"
                style={{
                  background: tab === value ? "#EF9F27" : "transparent",
                  color: tab === value ? "#050505" : "rgba(255,255,255,0.52)"
                }}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="mt-4 min-h-0 flex-1">
            {tab === "brief" ? (
              <section className="h-full border border-terminalBorder bg-white/[0.025] p-3 text-[11px] leading-relaxed text-white/62">
                {activeBrief ? (
                  <>
                    <p className="text-white/84">{activeBrief.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-white/42">
                      <span>{activeBrief.archetype}</span>
                      <span>{activeBrief.spatialAssetFamily}</span>
                      <span>{Math.round(activeBrief.confidence * 100)}%</span>
                    </div>
                    <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-amber/70">
                      {lastFallbackPath ?? activeBrief.fallbackPath}
                    </p>
                    <div className="mt-4 grid gap-2 text-[10px] text-white/46">
                      {activeBrief.proofPoints.slice(0, 3).map((point) => (
                        <div key={point} className="border-l border-terminalBorder pl-2">
                          {point}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="grid h-full place-items-center text-center text-[10px] uppercase tracking-[0.14em] text-white/34">
                    Brief appears after the first generation
                  </div>
                )}
              </section>
            ) : null}

            {tab === "feed" ? (
              <section className="flex h-full flex-col border border-terminalBorder bg-white/[0.025] p-3">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                  Recent System Feed
                </p>
                <ol className="yiiya-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-[10px] leading-relaxed text-white/60">
                  {recentLogs.map((log) => (
                    <li key={log.id} className="border-l border-terminalBorder pl-2">
                      <span className="text-amber/75">[{log.timestamp}]</span>{" "}
                      <span>{log.label}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {tab === "layers" ? (
              <section className="flex h-full flex-col border border-terminalBorder bg-white/[0.025] p-3">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                  Active Layers
                </p>
                {layers.length === 0 ? (
                  <div className="grid h-full place-items-center text-[10px] uppercase tracking-[0.14em] text-white/34">
                    No layers mounted
                  </div>
                ) : (
                  <ol className="yiiya-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                    {layers.slice(-10).reverse().map((layer) => (
                      <li
                        key={layer.id}
                        className="flex min-h-8 items-center justify-between border-b border-terminalBorder text-[11px]"
                      >
                        <span className="truncate text-white/80">{layer.name}</span>
                        <span className="ml-3 shrink-0 text-[10px] uppercase tracking-[0.12em] text-amber/70">
                          {typeLabel[layer.type]}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
