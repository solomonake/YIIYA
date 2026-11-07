import { NextResponse, type NextRequest } from "next/server";
import { isInterpretRequest, runInterpretOnce } from "@/lib/interpret-pipeline";
import { guardRequest } from "@/app/api/interpret/guard";
import { readGenerationBody, GenerationBodyError } from "@/lib/security/generation-body";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await readGenerationBody(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof GenerationBodyError ? error.message : "Invalid JSON body" },
      { status: error instanceof GenerationBodyError ? error.status : 400 });
  }

  if (!isInterpretRequest(body) || !body.transcript.trim()) {
    return NextResponse.json({ error: "Expected { transcript: string }" }, { status: 400 });
  }

  const guard = await guardRequest(request, body);
  if (!guard.ok) return guard.response;

  try {
    const output = await runInterpretOnce({ ...body, transcript: guard.body.transcript });
    return NextResponse.json(output);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : "Pipeline error").replace(/[\r\n]/g, " ").slice(0, 200);
    const status = msg.includes("Missing env") ? 503 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
