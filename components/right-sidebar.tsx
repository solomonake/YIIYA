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
  const toggleSidebar = useYiiyaStore((state) => state.toggleSidebar);

  return (
    <aside
      className="absolute right-0 top-0 z-20 flex h-full flex-col border-l border-white/10 bg-ink/90 backdrop-blur-xl transition-[width] duration-200"
      style={{ width: collapsed ? 44 : 220 }}
    >
      <button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleSidebar}
        className="flex h-11 shrink-0 items-center justify-center border-b border-white/10 text-sm text-white/50 transition hover:text-amber focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber/60"
      >
        <span aria-hidden="true">{collapsed ? "<" : ">"}</span>
      </button>

      {collapsed ? null : (
        <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 py-5">
          <section className="flex min-h-0 flex-[1.15] flex-col">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              AI Log
            </h2>
            <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed text-white/60">
              {logs.map((log) => (
                <li key={log.id} className="border-l border-amber/45 pl-3">
                  <span className="block text-white/35">{log.timestamp}</span>
                  {log.label}
                </li>
              ))}
            </ol>
          </section>

          <section className="min-h-0 flex-1">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Layers
            </h2>
            {layers.length === 0 ? (
              <p className="font-mono text-[11px] text-white/35">Empty</p>
            ) : (
              <ol className="space-y-2 overflow-y-auto pr-1">
                {layers.map((layer) => (
                <li
                  key={layer.id}
                  className="flex h-9 items-center justify-between border-b border-white/10 text-sm"
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
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Mode
            </h2>
            <div className="grid grid-cols-2 rounded-[8px] border border-white/10 bg-white/5 p-1 text-center text-[11px] font-semibold">
              <span className="rounded-[6px] bg-amber px-2 py-1.5 text-ink">
                Web+3D
              </span>
              <span className="px-2 py-1.5 text-white/45">Web</span>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
