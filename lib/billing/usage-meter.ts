/**
 * Usage meter.
 * Provides usage recording and a read-only per-user/global spending screen.
 * Callers must explicitly record actual usage; this module cannot observe
 * provider calls automatically. It is not an atomic spending reservation.
 *
 * Production checks fail closed without a readable shared ledger. Development
 * may use an in-memory estimate, which resets on restart.
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

/** Legacy rate estimates only; unknown cost is never zero or proof of free usage. */
export function estimateCostUsd(event: UsageEvent): number | null {
  if (event.model) {
    if (!Object.hasOwn(PRICES, event.model)) return null;
    if (![event.promptTokens, event.completionTokens].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return null;
    const price = PRICES[event.model];
    const cost = (event.promptTokens! * price.in + event.completionTokens! * price.out) / 1_000_000;
    return Number.isFinite(cost) && cost >= 0 ? cost : null;
  }
  return Object.hasOwn(FIXED_USD, event.provider) ? FIXED_USD[event.provider] : null;
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
// Local estimate only, reset on cold start. It observes explicit recording calls,
// not actual provider activity, and cannot enforce a cross-instance budget.

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

export type UsageRecordResult = { recorded: true; estimatedCostUsd: number } |
  { recorded: false; reason: "unknown_cost" | "ledger_unavailable" | "ledger_write_failed" };

export async function recordUsage(event: UsageEvent): Promise<UsageRecordResult> {
  const cost = estimateCostUsd(event);
  if (cost === null) return { recorded: false, reason: "unknown_cost" };

  // Always update in-memory tracker
  memRecord(event.userId, cost);

  try {
    const client = serviceClient();
    if (!client) return { recorded: false, reason: "ledger_unavailable" };
    const result = await (client.from("usage_events") as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
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
    if (!result || result.error !== null) return { recorded: false, reason: "ledger_write_failed" };
    return { recorded: true, estimatedCostUsd: cost };
  } catch {
    return { recorded: false, reason: "ledger_write_failed" };
  }
}

export type BudgetCheck = {
  allow: boolean; spentUsd: number; capUsd: number; scope: "user" | "global";
  unavailable?: boolean;
};

/** Read-only spending screen, NOT an atomic reservation or complete cost guarantee. */
export async function checkBudget(userId?: string | null): Promise<BudgetCheck> {
  const userCap = Number(process.env.USAGE_DAILY_BUDGET_USD_PER_USER ?? "1.00");
  const globalCap = Number(process.env.USAGE_DAILY_BUDGET_USD_GLOBAL ?? "10.00");
  const unavailable = (): BudgetCheck => ({ allow: false, spentUsd: 0,
    capUsd: Number.isFinite(globalCap) && globalCap >= 0 ? globalCap : 0,
    scope: "global", unavailable: true });
  if (![userCap, globalCap].every(n => Number.isFinite(n) && n >= 0)) return unavailable();
  if (globalCap === 0) return { allow: false, spentUsd: 0, capUsd: 0, scope: "global" };
  if (userId && userCap === 0) return { allow: false, spentUsd: 0, capUsd: 0, scope: "user" };

  const memResult = memCheckBudget(userId);
  if (memResult) return memResult;

  try {
    const client = serviceClient();
    if (!client) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") return unavailable();
      const g = _memSpend.get("global");
      const spent = g && g.date === todayUTC() ? g.usd : 0;
      return { allow: true, spentUsd: spent, capUsd: globalCap, scope: "global" };
    }
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    // Exact counts detect PostgREST row truncation. Never interpret partial
    // data, a failed query or malformed costs as a complete zero-dollar ledger.
    const sum = (data: unknown, count: number | null): number | null => {
      if (!Array.isArray(data) || count !== data.length) return null;
      let total = 0;
      for (const row of data) {
        const raw = row?.cost_usd;
        if (typeof raw !== "number" && (typeof raw !== "string" || !raw.trim())) return null;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) return null;
        total += value;
      }
      return Number.isFinite(total) ? total : null;
    };
    if (userId) {
      const { data, error, count } = await client.from("usage_events")
        .select("cost_usd", { count: "exact" }).eq("user_id", userId)
        .gte("occurred_at", since.toISOString());
      const spent = sum(data, count);
      if (error || spent === null) return unavailable();
      if (spent >= userCap) return { allow: false, spentUsd: spent, capUsd: userCap, scope: "user" };
    }
    const { data, error, count } = await client.from("usage_events")
      .select("cost_usd", { count: "exact" }).gte("occurred_at", since.toISOString());
    const globalSpent = sum(data, count);
    if (error || globalSpent === null) return unavailable();
    return { allow: globalSpent < globalCap, spentUsd: globalSpent, capUsd: globalCap, scope: "global" };
  } catch {
    return unavailable();
  }
}
