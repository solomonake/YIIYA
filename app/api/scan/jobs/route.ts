import { NextResponse, type NextRequest } from "next/server";
import { createScanJob } from "@/lib/scan-job-store";
import { syncAssetJobFromScan } from "@/lib/asset-jobs";
import { issueScanAccess } from "@/lib/security/scan-capability";
import { resolveGenerationIdentity } from "@/lib/security/generation-identity";
import { checkLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { isSupabaseRestConfigured } from "@/lib/supabase-rest";
import { readGenerationBody, GenerationBodyError } from "@/lib/security/generation-body";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const payload = await readGenerationBody(request) as { promptHint?: unknown } | null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        (payload.promptHint !== undefined && (typeof payload.promptHint !== "string" || payload.promptHint.length > 8000))) {
      return NextResponse.json({ error: "Expected an optional promptHint of at most 8000 characters." }, { status: 400 });
    }
    const identity = await resolveGenerationIdentity(request);
    const limit = await checkLimit("interpret", identity.identityKey);
    if (limit.unavailable) return NextResponse.json({ error: "Scan admission is temporarily unavailable." }, { status: 503 });
    if (!limit.success) return NextResponse.json({ error: "Too many scan requests. Try later." }, { status: 429, headers: rateLimitHeaders(limit) });
    if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") && !isSupabaseRestConfigured("service")) {
      return NextResponse.json({ error: "Shared scan storage is not configured." }, { status: 503 });
    }
    const access = issueScanAccess();
    const result = await createScanJob(new URL(request.url).origin, payload.promptHint as string | undefined,
      { ownerId: identity.userId, tokenHash: access.tokenHash, expiresAt: access.expiresAt });
    syncAssetJobFromScan(result.job);
    // Fragment is not sent to the server/referrers. Never persist plaintext token URLs.
    return NextResponse.json({ ...result, accessToken: access.token, accessExpiresAt: access.expiresAt,
      mobileUrl: `${result.mobileUrl}#scanToken=${access.token}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof GenerationBodyError ? error.message : "Scan creation is unavailable. Try again later." },
      { status: error instanceof GenerationBodyError ? error.status : 503 });
  }
}
