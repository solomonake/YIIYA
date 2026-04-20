"use client";

import { useEffect, useState } from "react";
import { readPublishedProject } from "@/lib/publish-project";
import type { PublishedProject } from "@/lib/published-project-types";

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

  useEffect(() => {
    if (initialProject) {
      return;
    }

    setProject(readPublishedProject(slug));
  }, [initialProject, slug]);

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
    <main className="min-h-svh bg-ink text-bone">
      {project.sceneState.sceneCanvasImage ? (
        <img
          src={project.sceneState.sceneCanvasImage}
          alt=""
          className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-55"
        />
      ) : null}
      <div
        className="relative z-10 min-h-svh"
        dangerouslySetInnerHTML={{ __html: project.htmlSnapshot }}
      />
      {project.sceneState.showWatermark ?? !project.isPro ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-full border border-white/12 bg-[#11110f]/92 px-3 py-2 text-xs font-semibold text-bone backdrop-blur-xl">
          Built with <span className="text-amber">Yiiya</span>
        </div>
      ) : null}
    </main>
  );
}
