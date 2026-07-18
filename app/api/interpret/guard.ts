/**
 * Pre-flight + post-flight guards for the /api/interpret route.
 *
 * Runs rate limiting, budget enforcement, prompt firewall, and brand
 * extraction before any LLM or 3D provider call is made.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { checkLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { inspectPrompt } from "@/lib/security/prompt-firewall";
import { checkBudget } from "@/lib/billing/usage-meter";
import { sanitizePayload } from "@/lib/security/sanitize";
import { checkSlop } from "@/lib/critic/slop-guard";
import { checkA11y, adjustForContrast } from "@/lib/critic/a11y-guard";
import { extractBrand } from "@/lib/brief/company-extractor";
import { pickStakeFromVibe, type Stake } from "@/lib/brief/stake-matrix";
import { resolveGenerationIdentity, type GenerationIdentity } from "@/lib/security/generation-identity";

/**
 * Minimal schema — only fields the guard itself reads. `.passthrough()` keeps
 * the rest of the route's wider body shape (referenceImage, cursorTarget,
 * image_mode, scanJobId, …) intact so the pipeline still sees everything.
 */
const InputSchema = z
  .object({
    transcript: z.string().min(1).max(8000),
    userId: z.string().uuid().optional(),
    sessionId: z.string().optional()
  })
  .passthrough();

export type GuardedBody = z.infer<typeof InputSchema> & Record<string, unknown>;

export type GuardOk = {
  ok: true;
  body: GuardedBody;
  identity: GenerationIdentity;
  stake: Stake;
  traceId: string;
  /** Daily free-generations left after this request (undefined for exempt users). */
  generationsRemaining?: number;
  generationsLimit?: number;
};
export type GuardFail = {
  ok: false;
  response: Response;
  error: string;
  message: string;
  retryAfter?: number;
};

export async function guardRequest(
  req: NextRequest,
  rawBody: unknown
): Promise<GuardOk | GuardFail> {
  const traceId = req.headers.get("x-yiiya-trace-id") ?? crypto.randomUUID();

  // 1) Schema (loose — wider body fields are passed through).
  let parsed: GuardedBody;
  try {
    parsed = InputSchema.parse(rawBody) as GuardedBody;
  } catch (err) {
    return {
      ok: false,
      error: "invalid_input",
      message: err instanceof Error ? err.message : "bad input",
      response: jsonResponse(
        { error: "invalid_input", message: err instanceof Error ? err.message : "bad input" },
        400,
        { traceId }
      )
    };
  }

  // 2) Resolve identity (auth + exempt check).
  const identity = await resolveGenerationIdentity(req);

  let generationsRemaining: number | undefined;
  let generationsLimit: number | undefined;

  // Exempt users skip rate-limit and budget checks (developer account).
  if (!identity.isExempt) {
    // 3) Rate limit.
    const rl = await checkLimit("interpret", identity.identityKey);
    if (!rl.success) {
      const retryAfter = Math.ceil(Math.max(0, (rl.reset ?? Date.now()) - Date.now()) / 1000);
      return {
        ok: false,
        error: "rate_limited",
        message: `Generating too fast — wait ${retryAfter} seconds before trying again.`,
        retryAfter,
        response: jsonResponse(
          { error: "rate_limited", retry_after: rl.reset },
          429,
          { traceId, extra: rateLimitHeaders(rl) }
        )
      };
    }

    // 3b) Daily free-generation quota — the cap the user actually feels
    // ("N models a day"). Predictable and bounded-cost for us; tunable via
    // YIIYA_FREE_GENERATIONS_PER_DAY without a deploy.
    const gen = await checkLimit("generate3d", identity.identityKey);
    generationsRemaining = gen.remaining;
    generationsLimit = gen.limit;
    if (!gen.success) {
      const resetHrs = Math.max(1, Math.ceil(((gen.reset ?? Date.now()) - Date.now()) / 3_600_000));
      return {
        ok: false,
        error: "daily_generation_limit",
        message: `You've used your ${gen.limit} free generations for today — they reset in ~${resetHrs}h.`,
        response: jsonResponse(
          { error: "daily_generation_limit", limit: gen.limit, reset: gen.reset },
          429,
          { traceId, extra: rateLimitHeaders(gen) }
        )
      };
    }

    // 4) Daily budget (hard $ backstop behind the generation quota).
    const budget = await checkBudget(identity.userId);
    if (!budget.allow) {
      return {
        ok: false,
        error: "budget_exceeded",
        message: "Daily generation limit reached. Come back tomorrow!",
        response: jsonResponse(
          {
            error: "budget_exceeded",
            message: `Daily ${budget.scope} budget reached.`,
            spentUsd: budget.spentUsd,
            capUsd: budget.capUsd
          },
          402,
          { traceId }
        )
      };
    }
  }

  // 5) Prompt firewall — may rewrite the transcript.
  const verdict = await inspectPrompt(parsed.transcript);
  if (!verdict.allow) {
    return {
      ok: false,
      error: "blocked_by_firewall",
      message: verdict.reason ?? "Prompt blocked by content policy.",
      response: jsonResponse(
        { error: "blocked_by_firewall", message: verdict.reason },
        451,
        { traceId }
      )
    };
  }
  parsed.transcript = verdict.sanitized;

  // 6) Brand extraction + stake planting.
  const brand = await extractBrand(parsed.transcript);
  const stake = pickStakeFromVibe(brand.vibeKeywords, brand.industry);

  return { ok: true, body: parsed, identity, stake, traceId, generationsRemaining, generationsLimit };
}

export type ArchitectAction = Record<string, unknown> & { type?: string };

export type OutputGuardResult =
  | { ok: true; actions: ArchitectAction[]; warnings: string[] }
  | { ok: false; response: Response };

/**
 * Post-process Architect actions before returning:
 *   - sanitize string fields (XSS defence)
 *   - slop-guard rewrites (replace banned defaults)
 *   - a11y contrast warnings
 */
export async function guardOutput(
  actions: ArchitectAction[],
  stake: Stake,
  theme: { bg: string; fg: string }
): Promise<OutputGuardResult> {
  // Sanitize string fields.
  const sanitized = sanitizePayload(actions, ["href", "src", "url", "logo_url"]);

  // Slop guard.
  const slop = checkSlop(sanitized, stake);
  let adjusted = sanitized;
  if (slop.rewrites.length) {
    adjusted = applyRewrites(sanitized, slop.rewrites);
  }

  // A11y guard — currently emits warnings only; the contrast auto-fix is
  // exposed via the re-exported `adjustForContrast` for callers that want
  // to fix at render time.
  const a11y = checkA11y(adjusted, { bg: theme.bg, fg: theme.fg, lang: "en" });
  const warnings: string[] = [
    ...slop.warnings,
    ...a11y.issues.map((i) => `[${i.rule}] ${i.message}`)
  ];

  return { ok: true, actions: adjusted, warnings };
}

function jsonResponse(
  body: unknown,
  status: number,
  opts: { traceId: string; extra?: HeadersInit }
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-yiiya-trace-id": opts.traceId
  };
  if (opts.extra) {
    for (const [k, v] of Object.entries(opts.extra as Record<string, string>)) {
      headers[k] = v;
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function applyRewrites(
  actions: ArchitectAction[],
  rewrites: Array<{ path: string; after: string }>
): ArchitectAction[] {
  // Crude path-based replace — fine for the narrow set of fields slop-guard inspects.
  const cloned = JSON.parse(JSON.stringify(actions)) as ArchitectAction[];
  for (const r of rewrites) {
    setByPath(cloned, r.path, r.after);
  }
  return cloned;
}

function setByPath(root: unknown, path: string, value: string): void {
  const segments = path
    .replace(/^actions/, "")
    .split(/\.|\[|\]/)
    .filter(Boolean);
  let cur: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (cur && typeof cur === "object") {
      const next = (cur as Record<string, unknown>)[seg] ?? (cur as unknown[])[Number(seg)];
      if (next === undefined) return;
      cur = next;
    } else {
      return;
    }
  }
  const last = segments[segments.length - 1];
  if (cur && typeof cur === "object") {
    if (Array.isArray(cur)) cur[Number(last)] = value;
    else (cur as Record<string, unknown>)[last] = value;
  }
}

export { adjustForContrast };
