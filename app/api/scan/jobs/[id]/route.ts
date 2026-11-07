import { authorizeScanAccess } from "@/lib/security/scan-access";
import { NextResponse } from "next/server";
import { getScanJob } from "@/lib/scan-job-store";
import { syncAssetJobFromScan } from "@/lib/asset-jobs";

export const maxDuration = 30;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const denied = await authorizeScanAccess(request, params.id);
  if (denied) return denied;

  const job = await getScanJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  syncAssetJobFromScan(job);
  return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
}
