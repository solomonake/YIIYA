import type {
  PublishedProject,
  PublishedProjectContent
} from "@/lib/published-project-types";

type SupabaseProjectRow = {
  slug: string;
  content_json: PublishedProjectContent;
  theme_json: unknown;
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
    htmlSnapshot: row.content_json.htmlSnapshot,
    htmlCanvasImage: row.content_json.htmlCanvasImage,
    sceneState: row.content_json.sceneState,
    createdAt: row.content_json.createdAt ?? row.created_at
  };
}

export function canUseSupabasePublish() {
  return Boolean(getSupabaseConfig("service"));
}

export async function insertPublishedProject(project: PublishedProject) {
  const config = getSupabaseConfig("service");

  if (!config) {
    throw new Error("Supabase service role is not configured");
  }

  const response = await fetch(`${config.url}/rest/v1/projects`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      slug: project.slug,
      owner_id: null,
      content_json: {
        htmlSnapshot: project.htmlSnapshot,
        htmlCanvasImage: project.htmlCanvasImage,
        sceneState: project.sceneState,
        createdAt: project.createdAt
      } satisfies PublishedProjectContent,
      theme_json: project.sceneState.themeState ?? {}
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

export async function readPublishedProjectFromSupabase(slug: string) {
  const config = getSupabaseConfig("anon");

  if (!config) {
    return null;
  }

  const params = new URLSearchParams({
    select: "slug,content_json,theme_json,created_at",
    slug: `eq.${slug}`,
    limit: "1"
  });
  const response = await fetch(`${config.url}/rest/v1/projects?${params}`, {
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
