import { NextResponse } from "next/server";
import {
  isInterpretRequest,
  runInterpretOnce
} from "@/lib/interpret-pipeline";

function headerSafeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";

  return message.replace(/[\r\n]/g, " ").slice(0, 180);
}

export async function POST(request: Request) {
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

  try {
    const output = await runInterpretOnce(body);

    return NextResponse.json({
      actions: output.actions,
      qa_log: output.qa_log
    });
  } catch (error) {
    return NextResponse.json(
      { error: headerSafeMessage(error) },
      { status: error instanceof Error && error.message.includes("Missing required") ? 503 : 502 }
    );
  }
}
