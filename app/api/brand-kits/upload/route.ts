/**
 * POST /api/brand-kits/upload
 *
 * Multipart upload of a brand-kit logo file. The file is streamed to Vercel
 * Blob (https://vercel.com/docs/storage/vercel-blob) and the public URL is
 * returned. The caller (brand-kits-client.tsx) then PATCHes the brand kit
 * with `logoUrl = <returned url>`.
 *
 * Why a separate route:
 *   - Keeps multipart parsing isolated from the JSON brand-kit CRUD routes.
 *   - Image validation (size, MIME, dimensions via sharp) lives here.
 *   - The Vercel Blob client requires BLOB_READ_WRITE_TOKEN — kept server-side.
 *
 * Security:
 *   - Auth required (Supabase bearer JWT).
 *   - Hard cap at 5MB.
 *   - Allowed MIME: png/jpeg/webp/svg.
 *   - SVG is uploaded as `image/svg+xml` but not sanitized server-side beyond
 *     the MIME check — only render brand logos in <img> tags, never inline.
 */
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { userScopedClient } from "@/lib/supabase-server";
import { isVercelBlobConfigured } from "@/lib/vercel-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml"
]);

function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function POST(req: NextRequest) {
  if (!isVercelBlobConfigured()) {
    return NextResponse.json(
      { error: "blob_unconfigured", message: "BLOB_READ_WRITE_TOKEN is not set." },
      { status: 503 }
    );
  }

  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(token);
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported_mime", message: `Allowed: ${Array.from(ALLOWED_MIME).join(", ")}` },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", message: `Max ${MAX_BYTES / (1024 * 1024)}MB` },
      { status: 413 }
    );
  }

  // Namespace blobs by user id so collisions are impossible across tenants.
  // Vercel Blob always returns a unique URL even for the same key, but the
  // path makes audit + GC easier.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "logo";
  const key = `brand-kits/${user.user.id}/${Date.now()}-${safeName}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true
    });
    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      size: file.size
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "upload_failed",
        message: err instanceof Error ? err.message : "unknown"
      },
      { status: 502 }
    );
  }
}
