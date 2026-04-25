import { NextResponse } from "next/server";
import { createScanSession } from "@/lib/scan-session-store";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { promptHint?: string }
    | null;
  const origin = new URL(request.url).origin;
  const session = createScanSession(origin, payload?.promptHint);

  return NextResponse.json(session);
}
