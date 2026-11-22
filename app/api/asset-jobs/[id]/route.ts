import { NextResponse } from "next/server";
import { getAssetJob } from "@/lib/asset-jobs";
import { authorizeAssetJobAccess } from "@/lib/security/asset-job-access";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const job = getAssetJob(params.id);
  const denied = await authorizeAssetJobAccess(request, job);

  if (denied || !job) {
    return denied ?? NextResponse.json({ error: "Asset job not found." }, { status: 404 });
  }

  return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
}
