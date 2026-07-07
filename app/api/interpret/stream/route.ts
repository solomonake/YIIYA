import { type NextRequest } from "next/server";
import { isInterpretRequest, runInterpretPipeline } from "@/lib/interpret-pipeline";

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

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (e: unknown) => new TextEncoder().encode(encodeEvent(e));
      try {
        for await (const event of runInterpretPipeline(body)) {
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
