import { type NextRequest } from "next/server";
import { isInterpretRequest, runInterpretPipeline, type GeneratedAsset, type PBRMaterialBrief } from "@/lib/interpret-pipeline";
import { getUserIdFromAuthHeader } from "@/lib/auth/verify-request";
import { saveGeneratedAsset, findCachedAsset } from "@/lib/assets/persist";
import { buildExportUrls } from "@/lib/scene/export-urls";
import { retextureCacheKey } from "@/lib/meshy-retexture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The provider cascade needs up to 270s; keep the function alive for it.
export const maxDuration = 300;

const streamHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive"
};

function encodeEvent(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(encodeEvent({ type: "error", message: "Invalid JSON" }), { status: 400, headers: streamHeaders });
  }

  if (!isInterpretRequest(body) || !body.transcript.trim()) {
    return new Response(encodeEvent({ type: "error", message: "Expected { transcript: string }" }), { status: 400, headers: streamHeaders });
  }

  // Optional — anonymous generation still works, it just isn't saved to
  // /library. Resolved once up front so persistence never delays streaming.
  const userId = await getUserIdFromAuthHeader(request);

  // Prompt→asset cache: an exact prompt this user already paid for comes back
  // instantly and free. Skipped for reference-image runs (the image changes
  // the outcome) and forceGenerate (the user explicitly wants a fresh roll —
  // resubmitting the identical prompt is how you re-roll).
  if (userId && !body.referenceImage && !body.forceGenerate) {
    // Retextured assets are cached under a mesh-scoped key — "make it look
    // more human" only hits when it was said about the SAME active mesh.
    const cacheKeys = [
      body.transcript.trim(),
      ...(body.activeAssetGlbUrl ? [retextureCacheKey(body.transcript, body.activeAssetGlbUrl)] : [])
    ];
    const cached = await findCachedAsset(userId, cacheKeys);
    if (cached) {
      const asset: GeneratedAsset = {
        id: `asset-${Date.now()}-cache`,
        dbId: cached.id,
        name: cached.object_name,
        glbUrl: cached.glb_url,
        tier: cached.tier as GeneratedAsset["tier"],
        triangleCount: cached.triangle_count ?? undefined,
        materialBrief: (cached.brief_json?.materialBrief ?? {
          baseColor: "#b0b3ba", metalness: 0.1, roughness: 0.6, textureStyle: "unknown"
        }) as PBRMaterialBrief,
        textureUrls: (cached.brief_json?.textureUrls ?? undefined) as GeneratedAsset["textureUrls"],
        exportUrls: buildExportUrls(cached.glb_url, { usdzConfigured: Boolean(process.env.USDZ_CONVERTER_URL) }),
        scaleMeters: cached.scale_meters ?? 1,
        isWatertight: true
      };
      const events = [
        { type: "generating", log: `[CACHE] You already generated "${cached.object_name}" with this exact prompt — returning it instantly ($0). Reword the prompt slightly for a fresh roll.`, progress: 0.9 },
        { type: "asset_ready", asset, log: `[READY] "${asset.name}" — from your library, no generation spent.` },
        { type: "done", assets: [asset], brief: null, qa_log: ["[QA] Served from prompt cache — zero cost."] }
      ];
      return new Response(events.map(encodeEvent).join(""), { headers: streamHeaders });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (e: unknown) => new TextEncoder().encode(encodeEvent(e));
      try {
        for await (const event of runInterpretPipeline(body)) {
          if (event.type === "asset_ready" && userId) {
            // Awaited (not fire-and-forget): serverless functions can freeze
            // background work the instant the response is sent, so the save
            // must land before this event reaches the client.
            // Retextures save under a mesh-scoped prompt key so the cache
            // never serves them for the same phrase on a different asset.
            const promptKey = event.asset.sourceGlbUrl
              ? retextureCacheKey(body.transcript, event.asset.sourceGlbUrl)
              : body.transcript;
            const dbId = await saveGeneratedAsset(userId, promptKey, null, event.asset).catch(
              () => null
            );
            if (dbId) {
              (event.asset as GeneratedAsset).dbId = dbId;
            }
          }
          controller.enqueue(enc(event));
          if (event.type === "done" || event.type === "error") break;
        }
      } catch (err) {
        controller.enqueue(enc({ type: "error", message: err instanceof Error ? err.message : "Stream error" }));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: streamHeaders });
}
