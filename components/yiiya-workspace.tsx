"use client";

import dynamic from "next/dynamic";
import { useYiiyaStore } from "@/lib/store";
import { RightSidebar } from "@/components/right-sidebar";
import { ReferenceImageDropzone } from "@/components/reference-image-dropzone";
import { Toast } from "@/components/toast";
import { VoiceBar } from "@/components/voice-bar";
import { WebsiteLayer } from "@/components/website-layer";
import { publishCurrentProject } from "@/lib/publish-project";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((mod) => mod.SceneCanvas),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-ink" />
  }
);

export function YiiyaWorkspace() {
  const projectName = useYiiyaStore((state) => state.projectName);
  const setProjectName = useYiiyaStore((state) => state.setProjectName);
  const sidebarCollapsed = useYiiyaStore((state) => state.sidebarCollapsed);
  const addLog = useYiiyaStore((state) => state.addLog);

  const handlePublish = async () => {
    try {
      await publishCurrentProject();
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Publish failed");
    }
  };

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-ink text-bone">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-ink/90 px-5 backdrop-blur-xl">
        <input
          aria-label="Project name"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          className="w-[min(42vw,360px)] rounded-none border-none bg-transparent text-base font-semibold tracking-[0] text-bone outline-none transition-colors placeholder:text-white/35 focus:text-amber"
        />
        <button
          onClick={handlePublish}
          className="rounded-full bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[#ffb84f] focus:outline-none focus:ring-2 focus:ring-amber/60 focus:ring-offset-2 focus:ring-offset-ink"
        >
          Publish
        </button>
      </header>

      <section className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className="relative min-w-0 flex-1 canvas-grid"
          style={{
            marginRight: sidebarCollapsed ? 44 : 220,
            transition: "margin-right 220ms ease"
          }}
        >
          <SceneCanvas />
          <WebsiteLayer />
          <VoiceBar />
        </div>
        <RightSidebar />
      </section>
      <ReferenceImageDropzone />
      <Toast />
    </main>
  );
}
