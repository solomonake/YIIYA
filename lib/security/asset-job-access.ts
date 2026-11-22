import { NextResponse } from "next/server";
import type { AssetJob } from "@/lib/asset-jobs";
import { authorizeScanAccess } from "@/lib/security/scan-access";

/**
 * Asset jobs mirror scan jobs, so they inherit the scan's access rule: the
 * signed-in owner or a valid scan capability token. A job with no scan behind
 * it has no owner to check, so it is treated as not found (fail closed).
 */
export async function authorizeAssetJobAccess(request: Request, job: AssetJob | null): Promise<Response | null> {
  const scanId = job?.inputs.scanId;

  if (!job || !scanId) {
    return NextResponse.json({ error: "Asset job not found." }, { status: 404 });
  }

  return authorizeScanAccess(request, scanId);
}
