/**
 * Usage meter.
 * Records every metered call (LLM, 3D generation, image moderation) to
 * supabase.usage_events and enforces per-user / global daily USD budgets.
 *
 * When Supabase is not configured, an in-memory tracker provides budget
 * enforcement (resets on cold start, but still prevents runaway spend within
 * a single serverless instance lifetime).
 */
import { createClient } from "@supabase/supabase-js";

type PriceTable = Record<string, { in: number; out: number }>; // USD per 1M tokens

const PRICES: PriceTable = {
  "gemini-2.5-flash": { in: 0.075, out: 0.3 },
  "gemini-2.5-pro": { in: 1.25, out: 5.0 },
  "text-embedding-004": { in: 0.025, out: 0 },
  "gpt-4o": { in: 2.5, out: 10.0 },
  "claude-3-5-sonnet-20241022": { in: 3.0, out: 15.0 },
  "claude-3-5-haiku-20241022": { in: 0.8, out: 4.0 }
};

const FIXED_USD: Record<string, number> = {
  "trellis-2-hf": 0,
  "tripo-text-to-3d": 0.05,
  "instantmesh-hf": 0,
  "sparc3d-hf": 0,
  "image-moderation": 0
};

export type UsageEvent = {
  userId?: string | null;
  sessionId?: string | null;
  traceId?: string | null;
  stage: string;
  provider: string;
  model?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
};

export function estimateCostUsd(event: UsageEvent): number {
  if (event.model && PRICES[event.model]) {
    const p = PRICES[event.model];
    return (
      ((event.promptTokens ?? 0) * p.in) / 1_000_000 +
      ((event.completionTokens ?? 0) * p.out) / 1_000_000
    );
  }
  return FIXED_USD[event.provider] ?? 0;
}

let _serviceClient: ReturnType<typeof createClient> | null = null;
function serviceClient() {
  if (!_serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _serviceClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return _serviceClient;
}

// ─── In-memory budget tracker ────────────────────────────────────────────────
// Provides budget enforcement even without Supabase. Resets per cold start,
// but on Vercel serverless that still prevents a single instance from burning
// through credits unchecked. Always updated alongside Supabase writes so it
// provides immediate protection.

const _memSpend = new Map<string, { usd: number; date: string }>();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function memRecord(userId: string | null | undefined, costUsd: number): void {
  const today = todayUTC();

  // Per-user
  if (userId) {
    const key = `user:${userId}`;
    const entry = _memSpend.get(key);
    if (entry && entry.date === today) {
      entry.usd += costUsd;
    } else {
      _memSpend.set(key, { usd: costUsd, date: today });
    }
  }

  // Global
  const g = _memSpend.get("global");
  if (g && g.date === today) {
    g.usd += costUsd;
  } else {
    _memSpend.set("global", { usd: costUsd, date: today });
  }
}

function memCheckBudget(userId: string | null | undefined): BudgetCheck | null {
  const today = todayUTC();
  const userCap = parseFloat(process.env.USAGE_DAILY_BUDGET_USD_PER_USER ?? "1.00");
  const globalCap = parseFloat(process.env.USAGE_DAILY_BUDGET_USD_GLOBAL ?? "10.00");

  if (userId) {
    const entry = _memSpend.get(`user:${userId}`);
    if (entry && entry.date === today && entry.usd >= userCap) {
      return { allow: false, spentUsd: entry.usd, capUsd: userCap, scope: "user" };
    }
  }

  const g = _memSpend.get("global");
  if (g && g.date === today && g.usd >= globalCap) {
    return { allow: false, spentUsd: g.usd, capUsd: globalCap, scope: "global" };
  }

  return null; // under budget
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function recordUsage(event: UsageEvent): Promise<void> {
  const cost = estimateCostUsd(event);

  // Always update in-memory tracker
  memRecord(event.userId, cost);

  const client = serviceClient();
  if (!client) return;
  try {
    await (client.from("usage_events") as unknown as {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
    }).insert({
      user_id: event.userId ?? null,
      session_id: event.sessionId ?? null,
      trace_id: event.traceId ?? null,
      stage: event.stage,
      provider: event.provider,
      model: event.model ?? null,
      prompt_tokens: event.promptTokens ?? null,
      completion_tokens: event.completionTokens ?? null,
      latency_ms: event.latencyMs ?? null,
      cost_usd: cost,
      success: event.success ?? true,
      error_code: event.errorCode ?? null,
      metadata: event.metadata ?? {}
    });
  } catch {
    // Best-effort; never block the request on metering.
  }
}

export type BudgetCheck = { allow: boolean; spentUsd: number; capUsd: number; scope: "user" | "global" };

export async function checkBudget(userId?: string | null): Promise<BudgetCheck> {
  const userCap = parseFloat(process.env.USAGE_DAILY_BUDGET_USD_PER_USER ?? "1.00");
  const globalCap = parseFloat(process.env.USAGE_DAILY_BUDGET_USD_GLOBAL ?? "10.00");

  // In-memory check first (immediate, always available)
  const memResult = memCheckBudget(userId);
  if (memResult) return memResult;

  const client = serviceClient();
  if (!client) {
    // No Supabase — in-memory tracker is the only enforcement.
    const g = _memSpend.get("global");
    const today = todayUTC();
    const spent = g && g.date === today ? g.usd : 0;
    return { allow: true, spentUsd: spent, capUsd: globalCap, scope: "global" };
  }

  // Supabase check for cross-instance accuracy
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  if (userId) {
    const { data } = await client
      .from("usage_events")
      .select("cost_usd")
      .eq("user_id", userId)
      .gte("occurred_at", since.toISOString());
    const spent = (data ?? []).reduce((s, r) => s + Number((r as { cost_usd: number }).cost_usd ?? 0), 0);
    if (spent >= userCap) return { allow: false, spentUsd: spent, capUsd: userCap, scope: "user" };
  }

  const { data: g } = await client
    .from("usage_events")
    .select("cost_usd")
    .gte("occurred_at", since.toISOString());
  const globalSpent = (g ?? []).reduce((s, r) => s + Number((r as { cost_usd: number }).cost_usd ?? 0), 0);
  if (globalSpent >= globalCap) {
    return { allow: false, spentUsd: globalSpent, capUsd: globalCap, scope: "global" };
  }
  return { allow: true, spentUsd: globalSpent, capUsd: globalCap, scope: "global" };
}
