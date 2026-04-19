"use client";

import { useEffect, useState } from "react";
import {
  readPublishedProject,
  type PublishedProject
} from "@/lib/publish-project";

export function PublishedProjectView({ slug }: { slug: string }) {
  const [project, setProject] = useState<PublishedProject | null | undefined>();

  useEffect(() => {
    setProject(readPublishedProject(slug));
  }, [slug]);

  if (project === undefined) {
    return <main className="min-h-svh bg-ink" />;
  }

  if (!project) {
    return (
      <main className="grid min-h-svh place-items-center bg-ink px-6 text-center text-bone">
        <div>
          <h1 className="text-3xl font-semibold">Project not found</h1>
          <p className="mt-3 text-sm text-white/55">
            Published Yiiya projects are stored in this browser.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-svh bg-ink text-bone">
      <div
        className="min-h-svh"
        dangerouslySetInnerHTML={{ __html: project.htmlSnapshot }}
      />
      <div className="fixed bottom-4 right-4 z-50 rounded-full border border-white/12 bg-[#11110f]/92 px-3 py-2 text-xs font-semibold text-bone shadow-[0_14px_45px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        Built with <span className="text-amber">Yiiya</span>
      </div>
    </main>
  );
}
