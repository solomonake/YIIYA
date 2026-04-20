import { isInterpretRequest, runInterpretPipeline } from "@/lib/interpret-pipeline";

function encodeEvent(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return new Response(encodeEvent({ type: "error", message: "Invalid JSON body" }), {
      status: 400,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  }

  if (!isInterpretRequest(body) || body.transcript.trim().length === 0) {
    return new Response(
      encodeEvent({
        type: "error",
        message:
          "Expected { transcript: string, activeElementId: string | null, current_canvas_json: object }"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive"
        }
      }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      for await (const event of runInterpretPipeline(body)) {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
