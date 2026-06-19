// @ts-nocheck
"use client";

import { useEffect } from "react";
import {
  listLocalProjects,
  saveCurrentProject
} from "@/lib/project-persistence";
import { useYiiyaStore } from "@/lib/store";

export function useProjectAutosave() {
  const currentProjectId = useYiiyaStore((state) => state.currentProjectId);
  const sections = useYiiyaStore((state) => state.sections);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const themeState = useYiiyaStore((state) => state.themeState);
  const loadProject = useYiiyaStore((state) => state.loadProject);
  const setSaveStatus = useYiiyaStore((state) => state.setSaveStatus);
  const setToastMessage = useYiiyaStore((state) => state.setToastMessage);

  useEffect(() => {
    const [latestLocalProject] = listLocalProjects(1);

    if (latestLocalProject) {
      loadProject({
        id: latestLocalProject.id,
        projectName: latestLocalProject.project_name,
        canvas_json: latestLocalProject.canvas_json,
        theme_json: latestLocalProject.theme_json,
        logLabel: "SYSTEM: Project restored from local storage."
      });
      setToastMessage(`// Project restored — ${latestLocalProject.project_name}`);
      window.setTimeout(() => {
        if (
          useYiiyaStore.getState().toastMessage ===
          `// Project restored — ${latestLocalProject.project_name}`
        ) {
          useYiiyaStore.getState().setToastMessage(null);
        }
      }, 3000);
    }
  }, [loadProject, setToastMessage]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSaveStatus("saving");
      void saveCurrentProject().then(() => {
        setSaveStatus("saved", new Date().toLocaleTimeString());
      });
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [currentProjectId, sceneObjects, sections, setSaveStatus, themeState]);
}
