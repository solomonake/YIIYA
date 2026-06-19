import { type NextRequest, NextResponse } from "next/server";

// Format conversion stub — proxies the source GLB and returns it
// with the appropriate content-type for the requested format.
// Full gltf-transform conversion can be added here when needed.
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to") ?? "glb";

  if (!from) {
    return NextResponse.json({ error: "Missing ?from= parameter" }, { status: 400 });
  }

  // Validate URL safety — only allow absolute URLs starting with http/https or /api/
  const isRelative = from.startsWith("/");
  const isAbsolute = from.startsWith("http://") || from.startsWith("https://");
  if (!isRelative && !isAbsolute) {
    return NextResponse.json({ error: "Invalid source URL" }, { status: 400 });
  }

  try {
    const sourceUrl = isRelative ? `${request.nextUrl.origin}${from}` : from;
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      return NextResponse.json({ error: `Source fetch failed: ${res.status}` }, { status: 502 });
    }

    const buf = await res.arrayBuffer();
    const mimeMap: Record<string, string> = {
      glb: "model/gltf-binary",
      gltf: "model/gltf+json",
      obj: "model/obj",
      usd: "model/vnd.usdz+zip",
      usdz: "model/vnd.usdz+zip",
      fbx: "application/octet-stream",
      stl: "model/stl"
    };

    const mime = mimeMap[to] ?? "application/octet-stream";
    const filename = `model.${to}`;

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Conversion failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
