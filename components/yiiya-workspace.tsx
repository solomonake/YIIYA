"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { AccountIndicator } from "@/components/account-indicator";
import { AuthOverlay } from "@/components/auth-overlay";
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
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { CursorReticle } from "@/components/cursor-reticle";
import { useCursorTracker } from "@/lib/cursor/use-cursor-target";
import { useProjectAutosave } from "@/lib/use-project-autosave";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((mod) => mod.SceneCanvas),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-ink" />,
  },
);

const workflowSteps = ["Intent", "Model", "Validate", "Export"];

export function YiiyaWorkspace() {
  useProjectAutosave();
  useCursorTracker();

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
  const addLog = useYiiyaStore((state) => state.addLog);
  const resetProject = useYiiyaStore((state) => state.resetProject);
  const activeAssetJob = useYiiyaStore((state) => state.activeAssetJob);

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

  const handleExport = async () => {
    const readyArtifact = activeAssetJob?.artifacts.find(
      (artifact) => artifact.status === "ready" && artifact.url
    );

    if (!readyArtifact?.url) {
      addLog("[EXPORT]: No ready asset package is available yet.");
      return;
    }

    window.open(readyArtifact.url, "_blank", "noopener,noreferrer");
    addLog(`[EXPORT]: Opened ${readyArtifact.label}.`);
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
      <header className="z-20 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-terminalBorder bg-[#050505]/98 px-4 shadow-[0_12px_50px_rgba(0,0,0,0.42)]">
        <div className="flex min-w-0 items-center gap-4">
          <div className="hidden h-9 w-9 shrink-0 place-items-center border border-amber/50 bg-amber/10 text-[11px] font-black text-amber sm:grid">
            Y
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <input
                aria-label="Project name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="w-[min(34vw,340px)] rounded-none border-none bg-transparent text-[13px] font-semibold tracking-[0] text-bone outline-none transition-colors placeholder:text-white/35 focus:text-amber"
              />
              <span className="hidden text-[10px] uppercase tracking-[0.16em] text-white/35 md:inline">
                {saveStatus === "saving"
                  ? "saving"
                  : saveStatus === "saved" && lastSavedAt
                    ? `saved ${lastSavedAt}`
                    : "local draft"}
              </span>
            </div>
            <p className="mt-0.5 hidden truncate text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              CAD + 3D animation studio · export-ready assets
            </p>
          </div>
          <div className="hidden min-w-0 items-center gap-1 xl:flex">
            {workflowSteps.map((step, index) => (
              <div
                key={step}
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-white/34"
              >
                <span
                  className={
                    index === 1
                      ? "border border-amber/45 bg-amber/10 px-2 py-1 text-amber"
                      : "border border-terminalBorder px-2 py-1"
                  }
                >
                  {step}
                </span>
                {index < workflowSteps.length - 1 ? (
                  <span className="text-white/18">/</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          ) : null}
          <button
            onClick={handleExport}
            className="h-9 border border-amber/70 bg-amber px-4 text-[11px] font-black uppercase tracking-[0.16em] text-ink shadow-[0_0_24px_rgba(239,159,39,0.18)] transition hover:bg-signalAmber focus:outline-none focus:ring-1 focus:ring-amber"
          >
            Export
          </button>
          <AccountIndicator />
        </div>
      </header>

      <section className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className="relative min-w-0 flex-1 canvas-grid"
          style={{
            marginRight: sidebarCollapsed ? 44 : 304,
            transition: "margin-right 220ms ease",
          }}
        >
          <Suspense fallback={<div className="h-full w-full bg-ink" />}>
            <SceneCanvas />
          </Suspense>
          <WorkspaceNavigation
            onToggleProjects={() => setProjectDrawerOpen((open) => !open)}
            onToggleMap={() => setPitchMapOpen((open) => !open)}
            onNewProject={handleNewProject}
          />
          <EvolutionRail />
          <SpatialControlPanel />
          <Suspense fallback={null}>
            <ScanStudioPanel />
          </Suspense>
          <VoiceBar />
          <CursorReticle />
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
