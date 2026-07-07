import { type NextRequest } from "next/server";
import { isInterpretRequest, runInterpretPipeline, type GeneratedAsset } from "@/lib/interpret-pipeline";
import { getUserIdFromAuthHeader } from "@/lib/auth/verify-request";
import { saveGeneratedAsset } from "@/lib/assets/persist";

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

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (e: unknown) => new TextEncoder().encode(encodeEvent(e));
      try {
        for await (const event of runInterpretPipeline(body)) {
          if (event.type === "asset_ready" && userId) {
            // Awaited (not fire-and-forget): serverless functions can freeze
            // background work the instant the response is sent, so the save
            // must land before this event reaches the client.
            const dbId = await saveGeneratedAsset(userId, body.transcript, null, event.asset).catch(
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
