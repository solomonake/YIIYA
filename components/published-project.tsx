"use client";
// @ts-nocheck

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { readPublishedProject } from "@/lib/publish-project";
import type { PublishedProject } from "@/lib/published-project-types";
import { useYiiyaStore } from "@/lib/store";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((mod) => mod.SceneCanvas),
  { ssr: false }
);

export function PublishedProjectView({
  slug,
  initialProject
}: {
  slug: string;
  initialProject?: PublishedProject | null;
}) {
  const [project, setProject] = useState<PublishedProject | null | undefined>(
    initialProject
  );
  const loadProject = useYiiyaStore((state) => state.loadProject);
  const setCanvasMode = useYiiyaStore((state) => state.setCanvasMode);

  useEffect(() => {
    if (initialProject) {
      return;
    }

    setProject(readPublishedProject(slug));
  }, [initialProject, slug]);

  useEffect(() => {
    if (!project) {
      return;
    }

    loadProject({
      id: slug,
      projectName: project.sceneState.projectName,
      canvas_json: {
        sections: project.sceneState.sections as never,
        sceneObjects: project.sceneState.sceneObjects as never,
        layers: project.sceneState.layers as never
      },
      theme_json: project.sceneState.themeState as never
    });
    setCanvasMode("3D");
  }, [loadProject, project, setCanvasMode, slug]);

  if (project === undefined) {
    return <main className="min-h-svh bg-ink" />;
  }

  if (!project) {
    return (
      <main className="grid min-h-svh place-items-center bg-ink px-6 text-center text-bone">
        <div>
          <h1 className="text-3xl font-semibold">Project not found</h1>
          <p className="mt-3 text-sm text-white/55">
            This Yiiya project is not available from Supabase or this browser.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-ink text-bone">
      <SceneCanvas />
      {project.sceneState.showWatermark ?? !project.isPro ? (
        <div className="fixed bottom-4 right-4 z-50 border border-white/12 bg-[#11110f]/92 px-3 py-2 text-xs font-semibold text-bone backdrop-blur-xl">
          Built with <span className="text-amber">Yiiya</span>
        </div>
      ) : null}
    </main>
  );
}
