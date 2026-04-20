"use client";

import { useEffect } from "react";
import { autosaveCurrentProject } from "@/lib/publish-project";
import { useYiiyaStore } from "@/lib/store";

export function useProjectAutosave() {
  const currentProjectSlug = useYiiyaStore((state) => state.currentProjectSlug);
  const projectName = useYiiyaStore((state) => state.projectName);
  const sections = useYiiyaStore((state) => state.sections);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const themeState = useYiiyaStore((state) => state.themeState);
  const layers = useYiiyaStore((state) => state.layers);

  useEffect(() => {
    const hasCanvasState = sections.length > 0 || sceneObjects.length > 0;

    if (!hasCanvasState) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void autosaveCurrentProject();
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [currentProjectSlug, layers, projectName, sceneObjects, sections, themeState]);
}
