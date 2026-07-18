import type { PublishedProject } from "@/lib/published-project-types";

type SupabaseProjectRow = {
  slug: string;
  user_id?: string | null;
  canvas_json: {
    sections?: unknown[];
    sceneObjects?: unknown[];
    layers?: unknown[];
  };
  html_snapshot: string;
  scene_json: PublishedProject["sceneState"];
  theme_json: unknown;
  react_export?: string;
  created_at: string;
};

function getSupabaseConfig(role: "anon" | "service") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = role === "service" ? serviceRoleKey : anonKey;

  if (!url || !key || url.includes("your_supabase")) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    key
  };
}

function rowToPublishedProject(row: SupabaseProjectRow): PublishedProject {
  return {
    slug: row.slug,
    userId: row.user_id ?? null,
    htmlSnapshot: row.html_snapshot,
    htmlCanvasImage: "",
    sceneState: {
      ...row.scene_json,
      sections: row.canvas_json?.sections ?? row.scene_json.sections ?? [],
      sceneObjects: row.canvas_json?.sceneObjects ?? row.scene_json.sceneObjects ?? [],
      layers: row.canvas_json?.layers ?? row.scene_json.layers ?? [],
      themeState: row.theme_json ?? row.scene_json.themeState
    },
    createdAt: row.created_at,
    reactCode: row.react_export
  };
}

export function canUseSupabasePublish() {
  return Boolean(getSupabaseConfig("service"));
}

async function upsertProject(project: PublishedProject, draft: boolean) {
  const config = getSupabaseConfig("service");

  if (!config) {
    throw new Error("Supabase service role is not configured");
  }

  const response = await fetch(`${config.url}/rest/v1/published_projects?on_conflict=slug`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      slug: project.slug,
      user_id: project.userId ?? null,
      canvas_json: {
        sections: project.sceneState.sections,
        sceneObjects: project.sceneState.sceneObjects,
        layers: project.sceneState.layers
      },
      html_snapshot: project.htmlSnapshot,
      scene_json: project.sceneState,
      theme_json: project.sceneState.themeState ?? {},
      react_export: project.reactCode ?? "",
      created_at: project.createdAt
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase publish failed: ${message}`);
  }

  const rows = (await response.json()) as SupabaseProjectRow[];
  const row = rows[0];

  if (!row) {
    throw new Error("Supabase publish did not return a project row");
  }

  return rowToPublishedProject(row);
}

export async function insertPublishedProject(project: PublishedProject) {
  return upsertProject(project, false);
}

export async function autosaveProjectDraft(project: PublishedProject) {
  return upsertProject(project, true);
}

export async function readPublishedProjectFromSupabase(slug: string) {
  const config = getSupabaseConfig("anon");

  if (!config) {
    return null;
  }

  const params = new URLSearchParams({
    select: "slug,user_id,canvas_json,html_snapshot,scene_json,theme_json,react_export,created_at",
    slug: `eq.${slug}`,
    limit: "1"
  });
  const response = await fetch(`${config.url}/rest/v1/published_projects?${params}`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`
    },
    next: { revalidate: 30 }
  });

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as SupabaseProjectRow[];
  const row = rows[0];

  return row ? rowToPublishedProject(row) : null;
}
