/**
 * GET /api/domains/status/[domain]
 *
 * Polls Vercel for domain verification + SSL status.
 *
 * Reference: https://vercel.com/docs/rest-api/endpoints/projects#get-domain
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { domain: string } }) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return NextResponse.json({ error: "vercel_unconfigured" }, { status: 503 });

  const url = new URL(`https://api.vercel.com/v9/projects/${projectId}/domains/${params.domain}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: "vercel_error", details: payload }, { status: res.status });
  }
  return NextResponse.json({
    domain: params.domain,
    verified: payload.verified === true,
    verification: payload.verification ?? [],
    apex: payload.apexName,
    ssl: payload.ssl ?? null
  });
}
