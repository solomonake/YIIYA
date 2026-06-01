/**
 * Provider router.
 *
 * Picks a 3D-generation provider given a GenerationRequest and tries them in
 * a tier-ordered cascade. Each failure logs a usage event and advances; the
 * caller only sees a final success or a structured aggregate error.
 *
 * Tier policy (lowest cost / fastest first):
 *
 *   text-to-3d:
 *     preview → tripo (fast)
 *               → trellis2-hf via gemini-imagen pipeline
 *
 *   image-to-3d:
 *     preview → instantmesh-hf (10s)
 *               → tripo
 *     final   → trellis2-hf (PBR, transparency)
 *               → sparc3d-hf (open surfaces, intricate geometry — TODO add provider)
 *               → tripo
 *
 * Usage events recorded for every attempt (success/failure) via usage-meter.
 */
import { instantmeshHf } from "./instantmesh-hf";
import { trellis2Hf } from "./trellis2-hf";
import { tripo } from "./tripo";
import type { GenerationKind, GenerationRequest, GenerationResult, ProviderClient } from "./types";
import { recordUsage } from "@/lib/billing/usage-meter";
import { withSpan } from "@/lib/telemetry/spans";

const PROVIDERS: Record<string, ProviderClient> = {
  "trellis2-hf": trellis2Hf,
  "tripo": tripo,
  "instantmesh-hf": instantmeshHf
};

function tierFor(req: GenerationRequest): ProviderClient[] {
  if (req.kind === "text-to-3d") {
    return req.intent === "preview" ? [tripo] : [tripo];
    // NB: text→image→3D for "final" is handled at a higher layer (text-to-3d.ts)
    //     because the image-generation step is independent.
  }
  if (req.intent === "preview") {
    return [instantmeshHf, tripo];
  }
  return [trellis2Hf, instantmeshHf, tripo];
}

export type RouterOutcome =
  | { ok: true; result: GenerationResult; attempts: AttemptLog[] }
  | { ok: false; attempts: AttemptLog[] };

export type AttemptLog = {
  provider: string;
  ok: boolean;
  ms: number;
  error?: string;
};

export async function generate3d(
  req: GenerationRequest,
  options: { totalTimeoutMs?: number } = {}
): Promise<RouterOutcome> {
  const totalBudget = options.totalTimeoutMs ?? req.budgetMs ?? 180_000;
  const deadline = Date.now() + totalBudget;
  const tiers = tierFor(req).filter((p) => p.supports(req.kind));
  const attempts: AttemptLog[] = [];

  for (const provider of tiers) {
    const remaining = deadline - Date.now();
    if (remaining <= 1000) break;

    const result = await withSpan(
      `yiiya.generate3d.${provider.name}`,
      {
        "yiiya.stage": "generate3d",
        "yiiya.provider": provider.name,
        "yiiya.kind": req.kind,
        "yiiya.intent": req.intent
      },
      async () => attemptProvider(provider, { ...req, budgetMs: remaining })
    );

    attempts.push({ provider: provider.name, ok: result.ok, ms: result.ms, error: result.error });

    await recordUsage({
      userId: req.userId,
      sessionId: req.sessionId,
      traceId: req.traceId,
      stage: "generate3d",
      provider: provider.name,
      latencyMs: result.ms,
      success: result.ok,
      errorCode: result.error ? "provider_failed" : null,
      metadata: { kind: req.kind, intent: req.intent, attempt: attempts.length }
    });

    if (result.ok && result.value) {
      return { ok: true, result: result.value, attempts };
    }
  }

  return { ok: false, attempts };
}

async function attemptProvider(
  provider: ProviderClient,
  req: GenerationRequest
): Promise<{ ok: boolean; ms: number; value?: GenerationResult; error?: string }> {
  const started = Date.now();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), req.budgetMs ?? 120_000);
  try {
    const value = await provider.generate(req, ac.signal);
    return { ok: true, ms: Date.now() - started, value };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : "unknown"
    };
  } finally {
    clearTimeout(t);
  }
}

export function getProvider(name: keyof typeof PROVIDERS): ProviderClient {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`unknown provider: ${name}`);
  return p;
}
