"use client";

import { useYiiyaStore } from "@/lib/store";

const typeLabel = {
  site: "Site",
  scene: "Scene",
  mesh: "Mesh",
  light: "Light",
  section: "Section"
} as const;

export function RightSidebar() {
  const collapsed = useYiiyaStore((state) => state.sidebarCollapsed);
  const logs = useYiiyaStore((state) => state.logs);
  const layers = useYiiyaStore((state) => state.layers);
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const activeBrief = useYiiyaStore((state) => state.activeBrief);
  const lastFallbackPath = useYiiyaStore((state) => state.lastFallbackPath);
  const toggleSidebar = useYiiyaStore((state) => state.toggleSidebar);

  return (
    <aside
      className="absolute right-0 top-0 z-20 flex h-full flex-col border-l border-terminalBorder bg-ink/95 backdrop-blur-xl transition-[width] duration-200"
      style={{ width: collapsed ? 44 : 220 }}
    >
      <button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleSidebar}
        className="flex h-10 shrink-0 items-center justify-center border-b border-terminalBorder text-[11px] text-white/45 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-inset focus:ring-amber"
      >
        <span aria-hidden="true">{collapsed ? "<" : ">"}</span>
      </button>

      {collapsed ? null : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 py-4">
          {activeBrief ? (
            <section className="shrink-0">
              <h2 className="mb-3 border-b border-terminalBorder pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                Brief
              </h2>
              <div className="border border-terminalBorder bg-white/[0.025] p-2 text-[10px] leading-relaxed text-white/62">
                <p className="text-white/84">{activeBrief.summary}</p>
                <p className="mt-2 text-white/45">
                  {activeBrief.archetype} · {activeBrief.spatialAssetFamily} · {Math.round(activeBrief.confidence * 100)}%
                </p>
                <p className="mt-1 text-amber/70">{lastFallbackPath ?? activeBrief.fallbackPath}</p>
              </div>
            </section>
          ) : null}
          <section className="flex min-h-0 flex-[1.15] flex-col">
            <h2 className="mb-3 border-b border-terminalBorder pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              System Operation Feed
            </h2>
            <ol className="yiiya-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-[10px] leading-relaxed text-white/60">
              {logs.map((log) => (
                <li key={log.id} className="border-l border-terminalBorder pl-2">
                  <span className="text-amber/75">[{log.timestamp}]</span>{" "}
                  <span>{log.label}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="min-h-0 flex-1">
            <h2 className="mb-3 border-b border-terminalBorder pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              Layers
            </h2>
            {layers.length === 0 ? (
              <p className="text-[10px] text-white/35">Empty</p>
            ) : (
              <ol className="yiiya-scrollbar space-y-1 overflow-y-auto pr-1">
                {layers.map((layer) => (
                <li
                  key={layer.id}
                  className="flex h-8 items-center justify-between border-b border-terminalBorder text-[11px]"
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

          <section className="shrink-0">
            <h2 className="mb-3 border-b border-terminalBorder pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              Mode
            </h2>
            <div className="grid grid-cols-3 border border-terminalBorder bg-white/[0.025] p-1 text-center text-[10px] font-bold uppercase tracking-[0.08em]">
              {(["WEB", "3D", "HYBRID"] as const).map((mode) => (
                <span
                  key={mode}
                  className={
                    canvasMode === mode
                      ? "bg-amber px-2 py-1.5 text-ink"
                      : "px-2 py-1.5 text-white/45"
                  }
                >
                  {mode}
                </span>
              ))}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
