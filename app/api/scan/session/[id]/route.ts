import { NextResponse } from "next/server";
import { getScanSession, updateScanSession } from "@/lib/scan-session-store";
import type { CoverageFrame } from "@/lib/scan-coverage";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = getScanSession(params.id);

  if (!session) {
    return NextResponse.json({ error: "Scan session not found." }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const payload = (await request.json().catch(() => null)) as
    | {
        status?: "waiting" | "capturing" | "ready";
        promptHint?: string;
        objectHint?: string;
        frame?: CoverageFrame;
      }
    | null;

  if (!payload) {
    return NextResponse.json({ error: "Invalid scan payload." }, { status: 400 });
  }

  const session = updateScanSession(params.id, payload);

  if (!session) {
    return NextResponse.json({ error: "Scan session not found." }, { status: 404 });
  }

  return NextResponse.json(session);
}
