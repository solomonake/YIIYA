import { type NextRequest, NextResponse } from "next/server";

import { isAllowedProviderUrl, providerAuthHeaders } from "@/lib/provider-hosts";
import { glbToObj, glbToStl } from "@/lib/scene/mesh-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 100 * 1024 * 1024;

/**
 * Real format conversion for generated assets.
 *
 *   ?from=<glb url>&to=obj  → Wavefront OBJ (opens in Blender/Maya/etc.)
 *   ?from=<glb url>&to=stl  → binary STL (opens in slicers/CAD)
 *   ?from=<glb url>&to=glb  → passthrough download
 *   ?from=<glb url>&to=usdz → 501 unless USDZ_CONVERTER_URL is configured
 *
 * The previous implementation returned GLB bytes with a renamed extension —
 * files that would not open anywhere. If a format can't genuinely be
 * produced, this route now says so instead of shipping a broken file.
 */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = (request.nextUrl.searchParams.get("to") ?? "glb").toLowerCase();

  if (!from) {
    return NextResponse.json({ error: "Missing ?from= parameter" }, { status: 400 });
  }

  // SSRF guard: only our own /api artifacts or allowlisted provider hosts.
  const isOwnRoute = from.startsWith("/api/");
  if (!isOwnRoute && !isAllowedProviderUrl(from)) {
    return NextResponse.json({ error: "Source host not allowed" }, { status: 400 });
  }

  const sourceUrl = isOwnRoute ? `${request.nextUrl.origin}${from}` : from;

  let glb: Buffer;
  try {
    const res = await fetch(sourceUrl, {
      headers: providerAuthHeaders(sourceUrl),
      signal: AbortSignal.timeout(60_000)
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Source fetch failed: ${res.status}` }, { status: 502 });
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      return NextResponse.json({ error: "Source too large" }, { status: 413 });
    }
    glb = Buffer.from(await res.arrayBuffer());
    if (glb.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Source too large" }, { status: 413 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: `Source fetch failed: ${msg}` }, { status: 502 });
  }

  try {
    if (to === "obj") {
      const { obj, triangles } = await glbToObj(new Uint8Array(glb));
      return fileResponse(Buffer.from(obj, "utf-8"), "model.obj", "model/obj", {
        "X-Yiiya-Triangles": String(triangles)
      });
    }

    if (to === "stl") {
      const { stl, triangles } = await glbToStl(new Uint8Array(glb));
      return fileResponse(stl, "model.stl", "model/stl", {
        "X-Yiiya-Triangles": String(triangles)
      });
    }

    if (to === "glb" || to === "gltf") {
      return fileResponse(glb, "model.glb", "model/gltf-binary");
    }

    if (to === "usdz" || to === "usd") {
      const converter = process.env.USDZ_CONVERTER_URL;
      if (!converter) {
        return NextResponse.json(
          {
            error: "usdz_converter_not_configured",
            message:
              "USDZ conversion requires an external converter (set USDZ_CONVERTER_URL). Download the GLB instead — Blender and Reality Converter both import it."
          },
          { status: 501 }
        );
      }
      const { convertGlbToUsdz } = await import("@/lib/scene/usdz-export");
      const { usdz } = await convertGlbToUsdz(glb);
      return fileResponse(usdz, "model.usdz", "model/vnd.usdz+zip");
    }

    return NextResponse.json({ error: `Unsupported format: ${to}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Conversion failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function fileResponse(
  body: Buffer,
  filename: string,
  mime: string,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=3600",
      ...extraHeaders
    }
  });
}
