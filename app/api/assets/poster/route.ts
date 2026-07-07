import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromAuthHeader } from "@/lib/auth/verify-request";
import { attachPosterUrl } from "@/lib/assets/persist";
import { isVercelBlobConfigured } from "@/lib/vercel-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  assetId: z.string().uuid(),
  // data: URI PNG captured from the R3F canvas after the mesh settles.
  dataUrl: z.string().startsWith("data:image/png;base64,").max(4_000_000)
});

/**
 * Saves a client-captured canvas thumbnail as the poster for a saved asset.
 * Requires auth (the same user who owns the asset) — attachPosterUrl scopes
 * the update to owner_id so this can't overwrite someone else's row.
 */
export async function POST(request: NextRequest) {
  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_input", message: err instanceof Error ? err.message : "bad request" },
      { status: 400 }
    );
  }

  if (!isVercelBlobConfigured()) {
    return NextResponse.json(
      { error: "blob_not_configured", message: "Poster storage is not configured on this deployment." },
      { status: 501 }
    );
  }

  try {
    const { put } = await import("@vercel/blob");
    const base64 = body.dataUrl.slice("data:image/png;base64,".length);
    const buffer = Buffer.from(base64, "base64");
    const blob = await put(`posters/${body.assetId}.png`, buffer, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false
    });

    const saved = await attachPosterUrl(userId, body.assetId, blob.url);
    if (!saved) {
      return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
    }

    return NextResponse.json({ posterUrl: blob.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Poster upload failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
