"use client";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";
import {
  useYiiyaStore,
  type Layer,
  type SceneObject,
  type YiiyaSection
} from "@/lib/store";
import type { YiiyaTheme } from "@/lib/designSystem";

export const projectStoragePrefix = "yiiya_project_";

export type ProjectRecord = {
  id: string;
  user_id: string | null;
  project_name: string;
  canvas_json: {
    sections: YiiyaSection[];
    sceneObjects: SceneObject[];
    layers: Layer[];
  };
  theme_json: YiiyaTheme;
  updated_at: string;
};

function localStorageKey(projectId: string) {
  return `${projectStoragePrefix}${projectId}`;
}

export function buildProjectRecord(userId: string | null): ProjectRecord {
  const state = useYiiyaStore.getState();

  return {
    id: state.currentProjectId,
    user_id: userId,
    project_name: state.projectName,
    canvas_json: {
      sections: state.sections,
      sceneObjects: state.sceneObjects,
      layers: state.layers
    },
    theme_json: state.themeState,
    updated_at: new Date().toISOString()
  };
}

export function saveProjectToLocalStorage(record: ProjectRecord) {
  localStorage.setItem(localStorageKey(record.id), JSON.stringify(record));
}

export function readLocalProject(projectId: string) {
  const raw = localStorage.getItem(localStorageKey(projectId));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ProjectRecord;
  } catch {
    return null;
  }
}

export function listLocalProjects(limit = Number.POSITIVE_INFINITY) {
  const projects: ProjectRecord[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);

    if (!key?.startsWith(projectStoragePrefix)) {
      continue;
    }

    const raw = localStorage.getItem(key);

    if (!raw) {
      continue;
    }

    try {
      projects.push(JSON.parse(raw) as ProjectRecord);
    } catch {
      continue;
    }
  }

  return projects
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, limit);
}

export function deleteLocalProject(projectId: string) {
  localStorage.removeItem(localStorageKey(projectId));
}

export async function getCurrentSupabaseUserId() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user?.id ?? null;
}

export async function saveCurrentProject() {
  const state = useYiiyaStore.getState();
  const shouldUseSupabase = isSupabaseConfigured() && !state.isGuest;
  const userId = shouldUseSupabase ? await getCurrentSupabaseUserId() : null;
  const record = buildProjectRecord(userId);

  if (!shouldUseSupabase) {
    saveProjectToLocalStorage(record);
    state.addLog("SYSTEM: Project saved.");
    return;
  }

  const supabase = getSupabaseBrowserClient();

  try {
    if (!supabase) {
      throw new Error("Supabase client unavailable");
    }

    const { error } = await supabase.from("projects").upsert(
      {
        id: record.id,
        user_id: record.user_id,
        project_name: record.project_name,
        canvas_json: record.canvas_json,
        theme_json: record.theme_json,
        updated_at: record.updated_at
      },
      { onConflict: "id" }
    );

    if (error) {
      throw error;
    }

    state.addLog("SYSTEM: Project saved.");
  } catch {
    saveProjectToLocalStorage(record);
    state.addLog("SYSTEM: Save failed — stored locally.");
  }
}

export async function listSupabaseProjects(limit = 8) {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id,user_id,project_name,canvas_json,theme_json,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as ProjectRecord[];
}

export async function updateSupabaseProjectName(projectId: string, projectName: string) {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("projects")
    .update({ project_name: projectName, updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

export async function deleteSupabaseProject(projectId: string) {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return;
  }

  await supabase.from("projects").delete().eq("id", projectId);
}
