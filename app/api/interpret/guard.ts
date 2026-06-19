// @ts-nocheck
/**
 * Pre-flight + post-flight guards for the /api/interpret route.
 *
 * The route (app/api/interpret/route.ts) already parses the body and runs a
 * loose `isInterpretRequest` shape check, so this module does NOT consume the
 * request stream. The route hands us the parsed body; we run security and
 * stake-planting against it and return the (firewall-sanitized) body for the
 * pipeline to consume.
 *
 * Wiring:
 *
 *   At the top of POST, after the existing isInterpretRequest check:
 *     const guard = await guardRequest(request, body);
 *     if (!guard.ok) return guard.response;
 *
 *   After runInterpretOnce returns, before responding:
 *     const safe = await guardOutput(output.actions, guard.stake, theme);
 *     if (!safe.ok) return safe.response;
 *     // respond with safe.actions, append safe.warnings to qa_log
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { checkLimit, hashIp, rateLimitHeaders } from "@/lib/security/rate-limit";
import { inspectPrompt } from "@/lib/security/prompt-firewall";
import { checkBudget } from "@/lib/billing/usage-meter";
import { sanitizePayload } from "@/lib/security/sanitize";
import { checkSlop } from "@/lib/critic/slop-guard";
import { checkA11y, adjustForContrast } from "@/lib/critic/a11y-guard";
import { extractBrand } from "@/lib/brief/company-extractor";
import { pickStakeFromVibe, type Stake } from "@/lib/brief/stake-matrix";

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
  stake: Stake;
  traceId: string;
};
export type GuardFail = { ok: false; response: Response };

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
      response: jsonResponse(
        { error: "invalid_input", message: err instanceof Error ? err.message : "bad input" },
        400,
        { traceId }
      )
    };
  }

  // 2) Rate limit.
  const ip =
    req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const identity = parsed.userId ? `user:${parsed.userId}` : `ip:${await hashIp(ip)}`;
  const rl = await checkLimit("interpret", identity);
  if (!rl.success) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "rate_limited", retry_after: rl.reset },
        429,
        { traceId, extra: rateLimitHeaders(rl) }
      )
    };
  }

  // 3) Daily budget.
  const budget = await checkBudget(parsed.userId);
  if (!budget.allow) {
    return {
      ok: false,
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

  // 4) Prompt firewall — may rewrite the transcript.
  const verdict = await inspectPrompt(parsed.transcript);
  if (!verdict.allow) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "blocked_by_firewall", message: verdict.reason },
        451,
        { traceId }
      )
    };
  }
  parsed.transcript = verdict.sanitized;

  // 5) Brand extraction + stake planting.
  const brand = await extractBrand(parsed.transcript);
  const stake = pickStakeFromVibe(brand.vibeKeywords, brand.industry);

  return { ok: true, body: parsed, stake, traceId };
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
