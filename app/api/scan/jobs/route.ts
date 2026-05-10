import { NextResponse } from "next/server";
import { createScanJob } from "@/lib/scan-job-store";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as
      | { promptHint?: string }
      | null;
    const origin = new URL(request.url).origin;
    const result = await createScanJob(origin, payload?.promptHint);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[SCAN API ERROR]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
