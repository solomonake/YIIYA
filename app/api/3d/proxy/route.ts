import { type NextRequest, NextResponse } from "next/server";

import { isAllowedProviderUrl, providerAuthHeaders } from "@/lib/provider-hosts";

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

  let upstream: Response;
  try {
    upstream = await fetch(src, {
      headers: providerAuthHeaders(src),
      signal: AbortSignal.timeout(90_000)
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: `Upstream fetch failed: ${msg}` }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream responded ${upstream.status}` },
      { status: 502 }
    );
  }

  const declared = Number(upstream.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "Artifact too large" }, { status: 413 });
  }

  const contentType = upstream.headers.get("content-type") ?? "model/gltf-binary";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType.includes("text/html") ? "model/gltf-binary" : contentType,
      // Provider temp URLs are unique per generation, so aggressive caching is safe.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
