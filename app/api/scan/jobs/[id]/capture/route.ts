import { NextResponse } from "next/server";
import { updateScanCapture } from "@/lib/scan-job-store";
import type { ScanLatestFrame } from "@/lib/scan-types";

export const maxDuration = 30;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const payload = (await request.json().catch(() => null)) as
    | {
        objectHint?: string;
        captureStatus?: "waiting" | "capturing" | "uploading" | "uploaded";
        frame?: ScanLatestFrame;
      }
    | null;

  if (!payload) {
    return NextResponse.json({ error: "Invalid capture payload." }, { status: 400 });
  }

  const job = await updateScanCapture(params.id, payload);

  if (!job) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  return NextResponse.json(job);
}
