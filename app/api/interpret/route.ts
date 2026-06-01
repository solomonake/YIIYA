import { NextResponse, type NextRequest } from "next/server";
import {
  isInterpretRequest,
  runInterpretOnce,
  type InterpretRequestBody
} from "@/lib/interpret-pipeline";
import { COLOR_STORIES } from "@/lib/brief/stake-matrix";
import { guardRequest, guardOutput, type ArchitectAction } from "./guard";

function headerSafeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";

  return message.replace(/[\r\n]/g, " ").slice(0, 180);
}

function withTrace(response: NextResponse, traceId: string) {
  response.headers.set("x-yiiya-trace-id", traceId);
  return response;
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isInterpretRequest(body) || body.transcript.trim().length === 0) {
    return NextResponse.json(
      {
        error:
          "Expected { transcript: string, activeElementId: string | null, current_canvas_json: object }"
      },
      { status: 400 }
    );
  }

  // Pre-flight: schema, rate limit, daily budget, prompt firewall, stake planting.
  const guard = await guardRequest(request, body);
  if (!guard.ok) return guard.response;

  // The firewall may have rewritten the transcript; hand the guard's body to
  // the pipeline so downstream sees the sanitized version.
  const pipelineBody = guard.body as unknown as InterpretRequestBody;
  const theme = COLOR_STORIES[guard.stake.colorStory];

  try {
    const output = await runInterpretOnce(pipelineBody);

    // Post-flight: sanitize string fields, run slop and a11y guards.
    const safe = await guardOutput(
      output.actions as unknown as ArchitectAction[],
      guard.stake,
      { bg: theme.bg, fg: theme.fg }
    );
    if (!safe.ok) return safe.response;

    const qa_log = safe.warnings.length
      ? [...output.qa_log, ...safe.warnings.map((w) => `[GUARD]: ${w}`)]
      : output.qa_log;

    return withTrace(
      NextResponse.json({
        actions: safe.actions,
        qa_log,
        brief: output.brief,
        confidence: output.confidence,
        fallbackPath: output.fallbackPath
      }),
      guard.traceId
    );
  } catch (error) {
    return withTrace(
      NextResponse.json(
        { error: headerSafeMessage(error) },
        { status: error instanceof Error && error.message.includes("Missing required") ? 503 : 502 }
      ),
      guard.traceId
    );
  }
}
