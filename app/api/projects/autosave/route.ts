// @ts-nocheck
import { NextResponse } from "next/server";
import type { PublishedProject } from "@/lib/published-project-types";
import {
  autosaveProjectDraft,
  canUseSupabasePublish
} from "@/lib/supabase-projects";

function isAutosaveProject(value: unknown): value is PublishedProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<PublishedProject>;

  return (
    typeof project.slug === "string" &&
    /^[a-z0-9]{8}$/.test(project.slug) &&
    typeof project.htmlSnapshot === "string" &&
    typeof project.htmlCanvasImage === "string" &&
    Boolean(project.sceneState) &&
    typeof project.createdAt === "string"
  );
}

export async function POST(request: Request) {
  if (!canUseSupabasePublish()) {
    return NextResponse.json(
      { error: "Supabase autosave is not configured" },
      { status: 503 }
    );
  }

  const body: unknown = await request.json();

  if (!isAutosaveProject(body)) {
    return NextResponse.json(
      { error: "Invalid autosave payload" },
      { status: 400 }
    );
  }

  try {
    await autosaveProjectDraft(body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Autosave failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
