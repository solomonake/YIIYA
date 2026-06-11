import { type NextRequest } from "next/server";
import {
  isInterpretRequest,
  runInterpretPipeline,
  type InterpretRequestBody
} from "@/lib/interpret-pipeline";
import type { YiiyaAction } from "@/lib/store";
import { COLOR_STORIES } from "@/lib/brief/stake-matrix";
import { guardRequest, guardOutput, type ArchitectAction } from "../guard";

const streamHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive"
};

function encodeEvent(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function guardFailureMessage(response: Response) {
  try {
    const parsed = (await response.json()) as { message?: string; error?: string };

    return parsed.message ?? parsed.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return new Response(encodeEvent({ type: "error", message: "Invalid JSON body" }), {
      status: 400,
      headers: streamHeaders
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
        headers: streamHeaders
      }
    );
  }

  const guard = await guardRequest(request, body);

  if (!guard.ok) {
    return new Response(
      encodeEvent({
        type: "error",
        message: await guardFailureMessage(guard.response)
      }),
      {
        status: guard.response.status,
        headers: streamHeaders
      }
    );
  }

  const pipelineBody = guard.body as unknown as InterpretRequestBody;
  const theme = COLOR_STORIES[guard.stake.colorStory];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let guardWarnings: string[] = [];

      for await (const event of runInterpretPipeline(pipelineBody)) {
        if ((event.type === "actions" || event.type === "done") && event.actions.length) {
          const safe = await guardOutput(
            event.actions as unknown as ArchitectAction[],
            guard.stake,
            { bg: theme.bg, fg: theme.fg }
          );

          if (!safe.ok) {
            controller.enqueue(
              encoder.encode(
                encodeEvent({
                  type: "error",
                  message: await guardFailureMessage(safe.response)
                })
              )
            );
            controller.close();
            return;
          }

          guardWarnings = safe.warnings.map((warning) => `[GUARD]: ${warning}`);
          const actions = safe.actions as unknown as YiiyaAction[];

          controller.enqueue(
            encoder.encode(
              encodeEvent(
                event.type === "done"
                  ? {
                      ...event,
                      actions,
                      qa_log: [...event.qa_log, ...guardWarnings]
                    }
                  : { ...event, actions }
              )
            )
          );
          continue;
        }

        if (event.type === "qa" && guardWarnings.length > 0) {
          controller.enqueue(
            encoder.encode(
              encodeEvent({ ...event, qa_log: [...event.qa_log, ...guardWarnings] })
            )
          );
          continue;
        }

        controller.enqueue(encoder.encode(encodeEvent(event)));
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: streamHeaders
  });
}
