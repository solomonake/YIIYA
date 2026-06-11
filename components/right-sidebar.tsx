"use client";

import { useEffect, useState } from "react";
import { useYiiyaStore } from "@/lib/store";

type SidebarTab = "guide" | "plan" | "feed" | "exports";

const laneGuide = {
  mesh: [
    "Ask for silhouette, materials, and handoff destination.",
    "Use image uploads when shape fidelity matters.",
    "Promote to final only after the preview feels directionally right."
  ],
  cad: [
    "Keep prompts bounded to hard-surface/product-style geometry.",
    "Name important parts and say dimensions when you know them.",
    "Use the CadQuery script as the editable source candidate."
  ],
  scan: [
    "Capture slow arcs around the object and vary height.",
    "Watch coverage before trusting the final solve.",
    "Use creator exports first, then move to cleanup in DCC tools."
  ]
} as const;

export function RightSidebar() {
  const collapsed = useYiiyaStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useYiiyaStore((state) => state.toggleSidebar);
  const logs = useYiiyaStore((state) => state.logs);
  const activeLane = useYiiyaStore((state) => state.activeLane);
  const assetBrief = useYiiyaStore((state) => state.assetBrief);
  const assetSummary = useYiiyaStore((state) => state.assetSummary);
  const routePlan = useYiiyaStore((state) => state.routePlan);
  const activeAssetJob = useYiiyaStore((state) => state.activeAssetJob);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const latestQuestion = useYiiyaStore((state) => state.latestQuestion);
  const [tab, setTab] = useState<SidebarTab>("guide");

  useEffect(() => {
    if (collapsed) {
      setTab("guide");
    }
  }, [collapsed]);

  const recentLogs = logs.slice(-8).reverse();

  return (
    <aside
      className="absolute right-0 top-0 z-20 flex h-full flex-col border-l border-terminalBorder bg-ink/95 backdrop-blur-xl transition-[width] duration-200"
      style={{ width: collapsed ? 44 : 304 }}
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
          <section className="yiiya-panel-subtle shrink-0 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/44">
                Asset shell
              </p>
              <span className="text-[10px] uppercase tracking-[0.14em] text-amber/75">
                {activeLane.toUpperCase()}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="border border-terminalBorder py-2">
                <p className="text-[10px] text-white/36">Objects</p>
                <p className="mt-1 text-sm font-semibold text-white/82">
                  {sceneObjects.length}
                </p>
              </div>
              <div className="border border-terminalBorder py-2">
                <p className="text-[10px] text-white/36">Checks</p>
                <p className="mt-1 text-sm font-semibold text-white/82">
                  {assetBrief?.readiness.checks.length ?? 0}
                </p>
              </div>
              <div className="border border-terminalBorder py-2">
                <p className="text-[10px] text-white/36">Artifacts</p>
                <p className="mt-1 text-sm font-semibold text-white/82">
                  {activeAssetJob?.artifacts.length ?? 0}
                </p>
              </div>
            </div>
          </section>

          <div className="mt-4 flex shrink-0 gap-1 border border-terminalBorder bg-white/[0.02] p-1">
            {(["guide", "plan", "feed", "exports"] as const).map((value) => (
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
            {tab === "guide" ? (
              <section className="yiiya-scrollbar flex h-full flex-col overflow-y-auto border border-terminalBorder bg-white/[0.025] p-3 text-[11px] leading-relaxed text-white/62">
                <div className="yiiya-focus-line border border-terminalBorder bg-amber/[0.055] p-3 pl-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber">
                    Lane guidance
                  </p>
                  <p className="mt-2 text-[11px] text-white/66">
                    Yiiya stays bounded on purpose so the handoff remains believable.
                  </p>
                </div>
                <div className="mt-3 grid gap-2">
                  {laneGuide[activeLane].map((line) => (
                    <div
                      key={line}
                      className="border border-terminalBorder bg-white/[0.018] px-3 py-2"
                    >
                      {line}
                    </div>
                  ))}
                </div>
                {latestQuestion ? (
                  <div className="mt-3 border border-amber/35 bg-amber/[0.06] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber">
                      Current question
                    </p>
                    <p className="mt-2 text-white/74">{latestQuestion}</p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === "plan" ? (
              <section className="yiiya-scrollbar h-full overflow-y-auto border border-terminalBorder bg-white/[0.025] p-3 text-[11px] leading-relaxed text-white/62">
                {assetBrief && routePlan ? (
                  <>
                    <p className="text-white/84">{assetSummary?.userVisible ?? assetBrief.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-white/42">
                      <span>{assetBrief.lane}</span>
                      <span>{assetBrief.destination}</span>
                      <span>{assetBrief.sourceKind}</span>
                    </div>
                    <div className="mt-4 grid gap-2 text-[10px] text-white/46">
                      <div className="border-l border-terminalBorder pl-2">
                        Preview: {routePlan.preview?.provider ?? "none"}
                      </div>
                      <div className="border-l border-terminalBorder pl-2">
                        Final: {routePlan.final?.provider ?? "none"}
                      </div>
                      <div className="border-l border-terminalBorder pl-2">
                        Exports: {routePlan.exportPack.map((item) => item.toUpperCase()).join(" / ")}
                      </div>
                    </div>
                    {activeAssetJob ? (
                      <div className="mt-4 grid gap-2 border border-terminalBorder bg-white/[0.018] p-3 text-[10px] text-white/50">
                        <div className="flex items-center justify-between gap-2 uppercase tracking-[0.12em]">
                          <span>{activeAssetJob.phase.replaceAll("_", " ")}</span>
                          <span>{Math.round(activeAssetJob.progress * 100)}%</span>
                        </div>
                        {activeAssetJob.handoff.notes.slice(0, 3).map((note) => (
                          <p key={note}>{note}</p>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="grid h-full place-items-center text-center text-[10px] uppercase tracking-[0.14em] text-white/34">
                    Asset plan appears after the first prompt
                  </div>
                )}
              </section>
            ) : null}

            {tab === "feed" ? (
              <section className="flex h-full flex-col border border-terminalBorder bg-white/[0.025] p-3">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                  Recent system feed
                </p>
                <div className="yiiya-scrollbar flex-1 overflow-y-auto text-[11px] text-white/58">
                  {recentLogs.map((entry) => (
                    <div key={entry.id} className="border-b border-terminalBorder/60 py-2">
                      <p className="text-[10px] text-white/28">{entry.timestamp}</p>
                      <p className="mt-1">{entry.label}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {tab === "exports" ? (
              <section className="yiiya-scrollbar h-full overflow-y-auto border border-terminalBorder bg-white/[0.025] p-3 text-[11px] leading-relaxed text-white/62">
                {activeAssetJob?.artifacts.length ? (
                  <div className="grid gap-2">
                    {activeAssetJob.artifacts.map((artifact) => (
                      <a
                        key={artifact.id}
                        href={artifact.url}
                        className="flex items-center justify-between border border-terminalBorder bg-white/[0.018] px-3 py-2 transition hover:border-amber/60"
                      >
                        <span>{artifact.label}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-white/38">
                          {artifact.status}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center text-center text-[10px] uppercase tracking-[0.14em] text-white/34">
                    Export artifacts appear after generation
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
