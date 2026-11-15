import { type NextRequest, NextResponse } from "next/server";

import { providerAuthHeaders } from "@/lib/provider-hosts";
import { glbToObj, glbToStl } from "@/lib/scene/mesh-export";
import { acceptGlbResponse, type AcceptanceReceipt } from "@/lib/scene/asset-acceptance";
import { resolveArtifactUpstream } from "@/lib/scene/viewer-source";


import { HF_ARTIFACT_HEADER } from "@/lib/hf-artifact-request";
import { normalizeHfToken } from "@/lib/huggingface-access";

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

  if (!["glb", "gltf", "obj", "stl", "usd", "usdz", "report"].includes(to)) {
    return NextResponse.json({ error: `Unsupported format: ${to}` }, { status: 400 });
  }

  // The exact artifact proxy is the only local source. Do not let conversion
  // recursively request itself or fetch unrelated application routes.
  const sourceUrl = resolveArtifactUpstream(from);
  if (!sourceUrl) {
    return NextResponse.json({ error: "Source host not allowed" }, { status: 400 });
  }

  const supplied = request.headers.get(HF_ARTIFACT_HEADER);
  const personalKey = normalizeHfToken(supplied);
  if (supplied !== null && !personalKey) {
    return NextResponse.json({ error: "Invalid Hugging Face credential" }, { status: 400 });
  }
  const headers = providerAuthHeaders(sourceUrl, personalKey);
  let glb: Buffer;
  let receipt: AcceptanceReceipt;
  try {
    const res = await fetch(sourceUrl, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(60_000)
    });
    if (!res.ok) {
      await res.body?.cancel();
      return NextResponse.json({ error: `Source fetch failed: ${res.status}` }, { status: 502 });
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      await res.body?.cancel();
      return NextResponse.json({ error: "Source too large" }, { status: 413 });
    }
    // Complete validation before returning an attachment; HTTP 200 from an
    // upstream does not establish GLB identity or transport completeness.
    const accepted = await acceptGlbResponse(res, MAX_BYTES);
    glb = Buffer.from(accepted.bytes);
    receipt = accepted.receipt;
  } catch {
    return NextResponse.json({ error: "Model download failed or the GLB was incomplete. Try generating it again." }, { status: 502 });
  }

  const cache = headers.Authorization ? "private, no-store" : "public, max-age=3600";
  try {
    if (to === "report") return NextResponse.json(receipt, { headers: { "Cache-Control": "private, no-store" } });
    if (to === "obj") {
      const { obj, triangles } = await glbToObj(new Uint8Array(glb));
      return fileResponse(Buffer.from(obj, "utf-8"), "model.obj", "model/obj", cache, {
        "X-Yiiya-Triangles": String(triangles)
      });
    }

    if (to === "stl") {
      const { stl, triangles } = await glbToStl(new Uint8Array(glb));
      return fileResponse(stl, "model.stl", "model/stl", cache, {
        "X-Yiiya-Triangles": String(triangles)
      });
    }

    if (to === "glb" || to === "gltf") {
      return fileResponse(glb, "model.glb", "model/gltf-binary", cache, { "X-Yiiya-Acceptance": receipt.contract, "X-Yiiya-SHA256": receipt.sha256, "X-Yiiya-Fidelity": "not-assessed" });
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
      return fileResponse(usdz, "model.usdz", "model/vnd.usdz+zip", cache);
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
  cache: string,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": cache,
      Vary: HF_ARTIFACT_HEADER,
      ...extraHeaders
    }
  });
}
