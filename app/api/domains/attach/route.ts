/**
 * POST /api/domains/attach
 *
 * Attaches a custom domain to a published YIIYA project via the Vercel REST API.
 *
 *   Body: { slug: string, domain: string }
 *   Auth: Bearer (user JWT)
 *
 * Required env:
 *   VERCEL_TOKEN         — https://vercel.com/account/tokens
 *   VERCEL_PROJECT_ID    — the YIIYA project ID (settings page)
 *   VERCEL_TEAM_ID       — optional, only if your project is on a team
 *
 * Reference: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project
 *
 * After this call returns 200, the response includes `verification` records
 * the user must add to their DNS provider (TXT or A record). Polling
 * /api/domains/status/[domain] returns when DNS propagates.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { userScopedClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;

const Body = z.object({
  slug: z.string().min(1).max(120),
  domain: z.string().regex(DOMAIN_RE, "invalid domain")
});

function token(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function POST(req: NextRequest) {
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!vercelToken || !projectId) {
    return NextResponse.json({ error: "vercel_unconfigured" }, { status: 503 });
  }
  const t = token(req);
  if (!t) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(t);
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid_input", details: String(err) }, { status: 400 });
  }

  // Confirm the requester owns this slug.
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, slug")
    .eq("slug", body.slug)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  const { data: user } = await supabase.auth.getUser();
  if (!user.user || (project as { owner_id: string | null }).owner_id !== user.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Call Vercel: add domain to project.
  const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const vercelRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: body.domain,
      // Redirect www → root automatically.
      redirect: undefined,
      // Vercel proxies /p/[slug] under custom domains via project rewrites
      // that you configure in vercel.json — we don't add per-domain rewrites here.
      gitBranch: null
    })
  });
  const payload = await vercelRes.json().catch(() => ({}));
  if (!vercelRes.ok) {
    return NextResponse.json(
      { error: "vercel_error", message: payload?.error?.message ?? "unknown", code: payload?.error?.code },
      { status: vercelRes.status }
    );
  }
  return NextResponse.json({
    ok: true,
    domain: body.domain,
    verification: payload?.verification ?? [],
    verified: payload?.verified ?? false
  });
}
