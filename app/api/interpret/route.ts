import { NextResponse, type NextRequest } from "next/server";
import { isInterpretRequest, runInterpretOnce } from "@/lib/interpret-pipeline";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isInterpretRequest(body) || !body.transcript.trim()) {
    return NextResponse.json({ error: "Expected { transcript: string }" }, { status: 400 });
  }

  try {
    const output = await runInterpretOnce(body);
    return NextResponse.json(output);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : "Pipeline error").replace(/[\r\n]/g, " ").slice(0, 200);
    const status = msg.includes("Missing env") ? 503 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
