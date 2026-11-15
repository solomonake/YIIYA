import { authorizeScanAccess } from "@/lib/security/scan-access";
import { NextResponse } from "next/server";
import { cancelScanJob } from "@/lib/scan-job-store";

export const maxDuration = 30;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const denied = await authorizeScanAccess(request, params.id);
  if (denied) return denied;

  const job = await cancelScanJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  return NextResponse.json(job);
}
