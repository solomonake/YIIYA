import { NextResponse } from "next/server";
import { z } from "zod";

import {
  MAX_SESSION_VIEWS,
  getSession,
  submitSessionViews
} from "@/lib/capture-session";
import { uploadImageToBlob } from "@/lib/vercel-blob";

export const maxDuration = 30;

/**
 * Laptop poll. Returns the session's status + hosted view URLs, or 404 once the
 * session is gone (expired TTL / never existed) so the UI can show "expired,
 * retry" rather than spinning forever.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession(params.id);
  if (!session) {
    return NextResponse.json(
      { error: "Capture session not found or expired." },
      { status: 404 }
    );
  }
  return NextResponse.json({ status: session.status, views: session.views });
}

const ImageSchema = z.object({
  base64: z.string().min(1),
  mediaType: z.string().min(1).optional()
});

// The phone submits either already-hosted view URLs, or raw base64 frames that
// the server hosts on Blob. Either way, only URLs end up in the session store.
const SubmitSchema = z.union([
  z.object({
    views: z.array(z.string().url()).min(1).max(MAX_SESSION_VIEWS)
  }),
  z.object({
    images: z.array(ImageSchema).min(1).max(MAX_SESSION_VIEWS)
  })
]);

/**
 * Phone submit. Uploads the orbit frames to Blob (when sent as base64), then
 * flips the session to `ready` with the hosted URLs. The laptop's next poll
 * sees `ready` and auto-generates.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession(params.id);
  if (!session) {
    return NextResponse.json(
      { error: "Capture session not found or expired." },
      { status: 404 }
    );
  }

  const parsed = SubmitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { views: string[] } or { images: [{ base64, mediaType }] }." },
      { status: 400 }
    );
  }

  let views: string[];
  if ("views" in parsed.data) {
    views = parsed.data.views;
  } else {
    const uploaded = await Promise.all(
      parsed.data.images.map((img) =>
        uploadImageToBlob(img.base64, img.mediaType ?? "image/png", "capture")
      )
    );
    views = uploaded.filter((u): u is string => typeof u === "string");
    if (views.length !== parsed.data.images.length) {
      // Blob unconfigured or an upload failed — do not half-commit a session.
      return NextResponse.json(
        { error: "Failed to host capture frames. Is Blob storage configured?" },
        { status: 502 }
      );
    }
  }

  const updated = await submitSessionViews(params.id, views);
  if (!updated) {
    return NextResponse.json(
      { error: "Capture session not found or expired." },
      { status: 404 }
    );
  }

  return NextResponse.json({ status: updated.status, views: updated.views });
}
