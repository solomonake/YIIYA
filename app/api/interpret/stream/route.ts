import { type NextRequest } from "next/server";
import { isInterpretRequest, runInterpretPipeline, type GeneratedAsset, type PBRMaterialBrief } from "@/lib/interpret-pipeline";
import { guardRequest } from "@/app/api/interpret/guard";
import { saveGeneratedAsset, findCachedAsset } from "@/lib/assets/persist";
import { buildExportUrls } from "@/lib/scene/export-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const streamHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no"
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

  const hasImage = isInterpretRequest(body) && Boolean(body.referenceImage?.base64);
  const hasTranscript = isInterpretRequest(body) && body.transcript.trim().length > 0;
  if (!isInterpretRequest(body) || (!hasTranscript && !hasImage)) {
    return new Response(encodeEvent({ type: "error", message: "Expected { transcript } or { referenceImage }" }), {
      status: 400,
      headers: streamHeaders
    });
  }

  // Rate limiting, budget enforcement, prompt firewall.
  // For image-only requests, inject a synthetic transcript so the guard's
  // zod schema (transcript.min(1)) passes.
  const guardBody = hasTranscript ? body : { ...body, transcript: "Photo-to-3D generation" };
  const guard = await guardRequest(request, guardBody);
  if (!guard.ok) {
    return new Response(
      encodeEvent({ type: "error", message: guard.message }),
      { status: guard.response.status, headers: streamHeaders }
    );
  }

  const userId = guard.identity.userId;

  // Surface the daily free-generation quota to the client so the UI can show a
  // "N/M left today" meter (headers are readable the moment the response starts,
  // before the body streams).
  const quotaHeaders: Record<string, string> =
    typeof guard.generationsRemaining === "number"
      ? {
          "X-Gen-Remaining": String(guard.generationsRemaining),
          "X-Gen-Limit": String(guard.generationsLimit ?? "")
        }
      : {};
  const respHeaders = { ...streamHeaders, ...quotaHeaders };

  if (userId && !body.referenceImage && !body.forceGenerate) {
    const cached = await findCachedAsset(userId, body.transcript.trim());
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
        // Not verified for cached rows either; watertightness needs a
        // full-geometry pass. Leave it unknown rather than asserting true.
        isWatertight: undefined
      };
      const events = [
        { type: "generating", log: `[CACHE] You already generated "${cached.object_name}" with this exact prompt — returning it instantly ($0). Reword the prompt slightly for a fresh roll.`, progress: 0.9 },
        { type: "asset_ready", asset, log: `[READY] "${asset.name}" — from your library, no generation spent.` },
        { type: "done", assets: [asset], brief: null, qa_log: ["[QA] Served from prompt cache — zero cost."] }
      ];
      return new Response(events.map(encodeEvent).join(""), { headers: respHeaders });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (e: unknown) => new TextEncoder().encode(encodeEvent(e));
      let closed = false;
      const safeEnqueue = (e: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc(e));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => safeEnqueue({ type: "heartbeat", t: Date.now() }), 10_000);

      try {
        for await (const event of runInterpretPipeline(body as Parameters<typeof runInterpretPipeline>[0])) {
          if (event.type === "asset_ready" && userId) {
            const dbId = await saveGeneratedAsset(userId, body.transcript, null, event.asset).catch(
              () => null
            );
            if (dbId) {
              (event.asset as GeneratedAsset).dbId = dbId;
            }
          }
          safeEnqueue(event);
          if (event.type === "done" || event.type === "error") break;
        }
      } catch (err) {
        safeEnqueue({ type: "error", message: err instanceof Error ? err.message : "Stream error" });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    }
  });

  return new Response(stream, { headers: respHeaders });
}
