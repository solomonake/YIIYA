import { type NextRequest, NextResponse } from "next/server";

import { isAllowedProviderUrl, providerAuthHeaders } from "@/lib/provider-hosts";
import { openGlbStream } from "@/lib/scene/glb-stream";

import { HF_ARTIFACT_HEADER } from "@/lib/hf-artifact-request";
import { normalizeHfToken } from "@/lib/huggingface-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 100MB hard cap — the largest legitimate provider GLBs are ~40MB.
const MAX_BYTES = 100 * 1024 * 1024;

/**
 * GLB delivery proxy.
 *
 * Provider GLBs live on ephemeral, sometimes auth-protected hosts (HF Space
 * gradio temp files return 403 to anonymous browsers). When Blob mirroring is
 * unavailable, the pipeline rewrites the winning URL through this route so
 * the viewer always fetches from our own origin with the right upstream
 * credentials attached server-side.
 */
export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");
  if (!src) {
    return NextResponse.json({ error: "Missing ?src= parameter" }, { status: 400 });
  }
  if (!isAllowedProviderUrl(src)) {
    return NextResponse.json({ error: "Source host not allowed" }, { status: 400 });
  }

  const supplied = request.headers.get(HF_ARTIFACT_HEADER);
  const personalKey = normalizeHfToken(supplied);
  if (supplied !== null && !personalKey) {
    return NextResponse.json({ error: "Invalid Hugging Face credential" }, { status: 400 });
  }
  const headers = providerAuthHeaders(src, personalKey);
  let upstream: Response;
  try {
    upstream = await fetch(src, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(90_000)
    });
  } catch {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    await upstream.body?.cancel();
    return NextResponse.json(
      { error: `Upstream responded ${upstream.status}` },
      { status: 502 }
    );
  }

  const declared = Number(upstream.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    await upstream.body?.cancel();
    return NextResponse.json({ error: "Artifact too large" }, { status: 413 });
  }

  let body: ReadableStream<Uint8Array>;
  try {
    body = await openGlbStream(upstream, MAX_BYTES);
  } catch {
    return NextResponse.json({ error: "Invalid or oversized GLB artifact" }, { status: 502 });
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      "X-Content-Type-Options": "nosniff",
      // A private download must never populate a shared cache.
      "Cache-Control": headers.Authorization ? "private, no-store" : "public, max-age=31536000, immutable",
      Vary: HF_ARTIFACT_HEADER,
      "Access-Control-Allow-Origin": "*"
    }
  });
}
