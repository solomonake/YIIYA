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
  return Boolean(getSupabaseConfig("anon"));
}

/** The slug belongs to another account, so this caller may not write it. */
export class PublishOwnershipError extends Error {
  constructor() {
    super("This project link belongs to another account.");
    this.name = "PublishOwnershipError";
  }
}

export type PublishOwner = { userId: string; accessToken: string };

function projectRowBody(project: PublishedProject, ownerId: string) {
  return {
    slug: project.slug,
    user_id: ownerId,
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
  };
}

/**
 * Writes a published project as the signed-in owner. The request carries the
 * owner's own access token with the anon key, so the "users own published" RLS
 * policy decides what may be written; the service role is never used here.
 * user_id always comes from the verified token, never from the request body.
 *
 * Update first (RLS limits it to rows this user owns), then insert. An insert
 * that conflicts means the slug is taken by someone else.
 */
async function saveOwnedProject(project: PublishedProject, owner: PublishOwner) {
  const config = getSupabaseConfig("anon");

  if (!config) {
    throw new Error("Supabase publish is not configured");
  }

  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${owner.accessToken}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
  const body = JSON.stringify(projectRowBody(project, owner.userId));
  const slugFilter = new URLSearchParams({ slug: `eq.${project.slug}` });

  const updated = await fetch(`${config.url}/rest/v1/published_projects?${slugFilter}`, {
    method: "PATCH",
    headers,
    body
  });

  if (!updated.ok) {
    throw new Error(`Supabase publish update failed with status ${updated.status}`);
  }

  const updatedRows = (await updated.json()) as SupabaseProjectRow[];

  if (updatedRows[0]) {
    return rowToPublishedProject(updatedRows[0]);
  }

  const inserted = await fetch(`${config.url}/rest/v1/published_projects`, {
    method: "POST",
    headers,
    body
  });

  if (inserted.status === 409 || inserted.status === 401 || inserted.status === 403) {
    throw new PublishOwnershipError();
  }

  if (!inserted.ok) {
    throw new Error(`Supabase publish insert failed with status ${inserted.status}`);
  }

  const rows = (await inserted.json()) as SupabaseProjectRow[];
  const row = rows[0];

  if (!row) {
    throw new Error("Supabase publish did not return a project row");
  }

  return rowToPublishedProject(row);
}

export async function insertPublishedProject(project: PublishedProject, owner: PublishOwner) {
  return saveOwnedProject(project, owner);
}

export async function autosaveProjectDraft(project: PublishedProject, owner: PublishOwner) {
  return saveOwnedProject(project, owner);
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
