import { NextResponse } from "next/server";
import type { PublishedProject } from "@/lib/published-project-types";
import {
  canUseSupabasePublish,
  insertPublishedProject,
  PublishOwnershipError
} from "@/lib/supabase-projects";
import { admitPublishWrite } from "@/lib/security/publish-guard";

function isPublishedProject(value: unknown): value is PublishedProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<PublishedProject>;

  return (
    typeof project.slug === "string" &&
    /^[a-z0-9]{8}$/.test(project.slug) &&
    (project.userId === undefined ||
      typeof project.userId === "string" ||
      project.userId === null) &&
    typeof project.htmlSnapshot === "string" &&
    typeof project.htmlCanvasImage === "string" &&
    (project.reactCode === undefined || typeof project.reactCode === "string") &&
    Boolean(project.sceneState) &&
    typeof project.createdAt === "string"
  );
}

export async function POST(request: Request) {
  if (!canUseSupabasePublish()) {
    return NextResponse.json(
      { error: "Supabase publish is not configured" },
      { status: 503 }
    );
  }

  const owner = await admitPublishWrite(request);

  if (owner instanceof Response) {
    return owner;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (!isPublishedProject(body)) {
    return NextResponse.json(
      { error: "Invalid published project payload" },
      { status: 400 }
    );
  }

  try {
    const project = await insertPublishedProject(body, owner);

    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof PublishOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Publishing failed. Try again later." }, { status: 500 });
  }
}
