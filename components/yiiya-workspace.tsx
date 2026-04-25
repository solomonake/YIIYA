"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { AccountIndicator } from "@/components/account-indicator";
import { AuthOverlay } from "@/components/auth-overlay";
import { CanvasModeToggle } from "@/components/canvas-mode-toggle";
import { EvolutionRail } from "@/components/evolution-rail";
import { PitchMap } from "@/components/pitch-map";
import { ProjectDrawer } from "@/components/project-drawer";
import { ScanStudioPanel } from "@/components/scan-studio-panel";
import { useYiiyaStore } from "@/lib/store";
import { RightSidebar } from "@/components/right-sidebar";
import { ReferenceImageDropzone } from "@/components/reference-image-dropzone";
import { SpatialControlPanel } from "@/components/spatial-control-panel";
import { Toast } from "@/components/toast";
import { VoiceBar } from "@/components/voice-bar";
import { WebsiteLayer } from "@/components/website-layer";
import { publishCurrentProject } from "@/lib/publish-project";
import { useProjectAutosave } from "@/lib/use-project-autosave";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((mod) => mod.SceneCanvas),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-ink" />
  }
);

export function YiiyaWorkspace() {
  useProjectAutosave();

  const [showNewConfirmation, setShowNewConfirmation] = useState(false);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [pitchMapOpen, setPitchMapOpen] = useState(false);
  const projectName = useYiiyaStore((state) => state.projectName);
  const setProjectName = useYiiyaStore((state) => state.setProjectName);
  const sidebarCollapsed = useYiiyaStore((state) => state.sidebarCollapsed);
  const sections = useYiiyaStore((state) => state.sections);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const saveStatus = useYiiyaStore((state) => state.saveStatus);
  const lastSavedAt = useYiiyaStore((state) => state.lastSavedAt);
  const strategyMode = useYiiyaStore((state) => state.strategyMode);
  const setStrategyMode = useYiiyaStore((state) => state.setStrategyMode);
  const addLog = useYiiyaStore((state) => state.addLog);
  const resetProject = useYiiyaStore((state) => state.resetProject);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("yiiya_v2_supercharge_logged") === "true") {
        return;
      }

      for (let step = 1; step <= 12; step += 1) {
        addLog(`SYSTEM: Step ${step} complete.`);
      }

      addLog("SYSTEM: Yiiya V2 supercharge complete.");
      sessionStorage.setItem("yiiya_v2_supercharge_logged", "true");
    } catch {
      for (let step = 1; step <= 12; step += 1) {
        addLog(`SYSTEM: Step ${step} complete.`);
      }

      addLog("SYSTEM: Yiiya V2 supercharge complete.");
    }
  }, [addLog]);

  const handlePublish = async () => {
    try {
      await publishCurrentProject();
    } catch (error) {
      addLog(`[SYSTEM]: ${error instanceof Error ? error.message : "Publish failed."}`);
    }
  };

  const handleNewProject = () => {
    if (sections.length === 0 && sceneObjects.length === 0) {
      resetProject();
      return;
    }

    setShowNewConfirmation(true);
  };

  const confirmNewProject = () => {
    resetProject();
    setShowNewConfirmation(false);
  };

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-ink font-mono text-bone">
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-terminalBorder bg-ink px-4">
        <div className="flex min-w-0 items-center gap-3">
          <input
            aria-label="Project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            className="w-[min(36vw,360px)] rounded-none border-none bg-transparent text-[13px] font-semibold tracking-[0] text-bone outline-none transition-colors placeholder:text-white/35 focus:text-amber"
          />
          <span className="hidden text-[11px] text-white/35 sm:inline">
            {saveStatus === "saving"
              ? "// saving"
              : saveStatus === "saved" && lastSavedAt
                ? `// saved ${lastSavedAt}`
                : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Open projects"
            title="Open projects"
            onClick={() => setProjectDrawerOpen((open) => !open)}
            className="grid h-8 w-8 place-items-center border border-terminalBorder text-white/65 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M4 4h7v7H4z" />
              <path d="M13 4h7v7h-7z" />
              <path d="M4 13h7v7H4z" />
              <path d="M13 13h7v7h-7z" />
            </svg>
          </button>
          <button
            type="button"
            title="Open founder pitch map"
            onClick={() => setPitchMapOpen((open) => !open)}
            className="h-8 border border-terminalBorder px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
          >
            Map
          </button>
          <button
            type="button"
            title="Strategy mode adds business rationale to new generations"
            onClick={() => setStrategyMode(!strategyMode)}
            className="h-8 border px-3 text-[11px] font-bold uppercase tracking-[0.12em] transition focus:outline-none focus:ring-1 focus:ring-amber"
            style={{
              borderColor: strategyMode ? "#EF9F27" : "#1A1A1A",
              color: strategyMode ? "#EF9F27" : "rgba(255,255,255,0.55)"
            }}
          >
            Strategy
          </button>
          {showNewConfirmation ? (
            <div className="flex h-8 items-center gap-2 border border-terminalBorder px-2 text-[11px] text-white/55">
              <span>Clear canvas and start fresh?</span>
              <button
                type="button"
                onClick={confirmNewProject}
                className="px-1.5 py-1 font-bold text-amber transition hover:text-signalAmber focus:outline-none focus:ring-1 focus:ring-amber"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setShowNewConfirmation(false)}
                className="px-1.5 py-1 text-white/45 transition hover:text-bone focus:outline-none focus:ring-1 focus:ring-amber"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleNewProject}
              className="h-8 border border-terminalBorder px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/65 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
            >
              New
            </button>
          )}
          <button
            onClick={handlePublish}
            className="h-8 border border-amber/60 bg-amber px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink transition hover:bg-signalAmber focus:outline-none focus:ring-1 focus:ring-amber"
          >
            Publish
          </button>
          <AccountIndicator />
        </div>
      </header>

      <section className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className="relative min-w-0 flex-1 canvas-grid"
          style={{
            marginRight: sidebarCollapsed ? 44 : 220,
            transition: "margin-right 220ms ease"
          }}
        >
          <Suspense fallback={<div className="h-full w-full bg-ink" />}>
            <SceneCanvas />
            <WebsiteLayer />
          </Suspense>
          <EvolutionRail />
          <CanvasModeToggle />
          <SpatialControlPanel />
          <Suspense fallback={null}>
            <ScanStudioPanel />
          </Suspense>
          <VoiceBar />
        </div>
        <RightSidebar />
        <ProjectDrawer
          open={projectDrawerOpen}
          onClose={() => setProjectDrawerOpen(false)}
        />
        <PitchMap open={pitchMapOpen} onClose={() => setPitchMapOpen(false)} />
      </section>
      <ReferenceImageDropzone />
      <Toast />
      <AuthOverlay />
    </main>
  );
}
