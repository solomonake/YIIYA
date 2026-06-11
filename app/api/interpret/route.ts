import { NextResponse, type NextRequest } from "next/server";
import {
  isInterpretRequest,
  runInterpretOnce,
  type InterpretRequestBody
} from "@/lib/interpret-pipeline";
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
  try {
    const output = await runInterpretOnce(pipelineBody);

    // Post-flight: sanitize string fields, run slop and a11y guards.
    let safeActions = output.actions;
    let guardWarnings: string[] = [];

    if (output.actions.length > 0) {
      const safe = await guardOutput(
        output.actions as unknown as ArchitectAction[],
        guard.stake,
        { bg: "#050505", fg: "#EDEDED" }
      );
      if (!safe.ok) return safe.response;
      safeActions = safe.actions as unknown as typeof output.actions;
      guardWarnings = safe.warnings.map((warning) => `[GUARD]: ${warning}`);
    }

    const qa_log = guardWarnings.length
      ? [...output.qa_log, ...guardWarnings]
      : output.qa_log;
    const assetPlan = output.assetPlan;

    return withTrace(
      NextResponse.json({
        summary: assetPlan.summary,
        lane: assetPlan.brief.lane,
        destination: assetPlan.brief.destination,
        assetPlan,
        assetBrief: assetPlan.brief,
        assetSummary: assetPlan.summary,
        routePlan: assetPlan.routePlan,
        actions: safeActions,
        qa_log,
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
