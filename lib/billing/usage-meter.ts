/**
 * Usage meter.
 * Records every metered call (LLM, 3D generation, image moderation) to
 * supabase.usage_events and enforces per-user / global daily USD budgets.
 *
 * Pricing table is opinionated; verify against each provider's current pricing
 * before relying on numbers for actual billing. Sources:
 *   - Gemini:  https://ai.google.dev/pricing
 *   - OpenAI:  https://openai.com/api/pricing/
 *   - Anthropic: https://www.anthropic.com/pricing
 *   - Tripo: https://platform.tripo3d.ai/billing
 *   - TRELLIS: free via HuggingFace Space
 */
import { createClient } from "@supabase/supabase-js";

type PriceTable = Record<string, { in: number; out: number }>; // USD per 1M tokens

const PRICES: PriceTable = {
  // Gemini — free tier exists; estimates are for paid usage.
  "gemini-2.5-flash": { in: 0.075, out: 0.3 },
  "gemini-2.5-pro": { in: 1.25, out: 5.0 },
  "text-embedding-004": { in: 0.025, out: 0 },
  // OpenAI
  "gpt-4o": { in: 2.5, out: 10.0 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { in: 3.0, out: 15.0 },
  "claude-3-5-haiku-20241022": { in: 0.8, out: 4.0 }
};

const FIXED_USD: Record<string, number> = {
  // Per-call flat costs (3D, image moderation, etc.)
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

export async function recordUsage(event: UsageEvent): Promise<void> {
  const cost = estimateCostUsd(event);
  const client = serviceClient();
  if (!client) return;
  try {
    // The supabase-js typed-schema overloads narrow `insert(values)` to `never`
    // when the database type hasn't been generated. We cast through `unknown`
    // to the loose row shape — the SQL migration (0003_production_foundation.sql)
    // is the source of truth.
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

/**
 * Pre-flight check before initiating a paid call. Returns allow=false if the
 * configured daily budget for this user (or globally) is already exhausted.
 */
export async function checkBudget(userId?: string | null): Promise<BudgetCheck> {
  const userCap = parseFloat(process.env.USAGE_DAILY_BUDGET_USD_PER_USER ?? "1.00");
  const globalCap = parseFloat(process.env.USAGE_DAILY_BUDGET_USD_GLOBAL ?? "5.00");
  const client = serviceClient();
  if (!client) return { allow: true, spentUsd: 0, capUsd: userCap, scope: "user" };

  // Window: since UTC midnight.
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
