import { NextResponse } from "next/server";
import { completeScanUpload } from "@/lib/scan-job-store";
import { syncAssetJobFromScan } from "@/lib/asset-jobs";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const payload = (await request.json().catch(() => null)) as
    | {
        objectHint?: string;
        durationMs?: number;
        keyframeCount?: number;
      }
    | null;
  const job = await completeScanUpload(params.id, payload ?? {});

  if (!job) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  syncAssetJobFromScan(job);
  return NextResponse.json(job);
}
