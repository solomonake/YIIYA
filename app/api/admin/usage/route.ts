/**
 * GET /api/admin/usage
 *
 * Read-only admin dashboard for current-day usage rollups. Protected by a
 * single shared secret in the Authorization header (configure via
 * YIIYA_ADMIN_TOKEN env var). Returns:
 *
 *   {
 *     spent_today_usd: number,
 *     global_cap_usd: number,
 *     top_users: [{ user_id, spent_usd, calls }],
 *     by_provider: [{ provider, calls, spent_usd, p95_ms }],
 *     recent_errors: [{ stage, provider, error_code, occurred_at }]
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminToken = process.env.YIIYA_ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json({ error: "admin_disabled" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${adminToken}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = serviceClient();
  if (!client) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { data: events } = await client
    .from("usage_events")
    .select("user_id, provider, model, latency_ms, cost_usd, success, error_code, stage, occurred_at")
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(5000);

  type Row = {
    user_id: string | null;
    provider: string;
    latency_ms: number | null;
    cost_usd: number;
    success: boolean;
    error_code: string | null;
    stage: string;
    occurred_at: string;
  };

  const rows = (events ?? []) as Row[];
  const totalSpent = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  const byUser = new Map<string, { spent: number; calls: number }>();
  const byProvider = new Map<string, { calls: number; spent: number; latencies: number[] }>();
  const errors: Row[] = [];

  for (const r of rows) {
    if (r.user_id) {
      const entry = byUser.get(r.user_id) ?? { spent: 0, calls: 0 };
      entry.spent += Number(r.cost_usd ?? 0);
      entry.calls += 1;
      byUser.set(r.user_id, entry);
    }
    const p = byProvider.get(r.provider) ?? { calls: 0, spent: 0, latencies: [] };
    p.calls += 1;
    p.spent += Number(r.cost_usd ?? 0);
    if (r.latency_ms != null) p.latencies.push(r.latency_ms);
    byProvider.set(r.provider, p);

    if (!r.success) errors.push(r);
  }

  const topUsers = Array.from(byUser.entries())
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, 10)
    .map(([user_id, e]) => ({ user_id, spent_usd: e.spent, calls: e.calls }));

  const byProviderOut = Array.from(byProvider.entries()).map(([provider, e]) => ({
    provider,
    calls: e.calls,
    spent_usd: e.spent,
    p95_ms: percentile(e.latencies, 0.95)
  }));

  return NextResponse.json({
    spent_today_usd: totalSpent,
    global_cap_usd: parseFloat(process.env.USAGE_DAILY_BUDGET_USD_GLOBAL ?? "5.00"),
    top_users: topUsers,
    by_provider: byProviderOut,
    recent_errors: errors.slice(0, 25).map((r) => ({
      stage: r.stage,
      provider: r.provider,
      error_code: r.error_code,
      occurred_at: r.occurred_at
    }))
  });
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}
