/**
 * Rate limiting via Upstash Redis (sliding window).
 *
 * Free tier: https://upstash.com  (10k commands/day on free plan)
 * Docs:      https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
 *
 * Three named limiters:
 *   - interpret  : 30 req / 5min per identity — burst/abuse guard on the
 *                  intent endpoint (covers edits, clarifies, and generations)
 *   - generate3d : the daily FREE-GENERATION quota per identity. This is the
 *                  "how many 3D models can I make today" cap the user actually
 *                  feels. Tunable via YIIYA_FREE_GENERATIONS_PER_DAY (default
 *                  10) — raise it without a deploy; each generation costs us
 *                  ~$0.02–0.31 depending on provider, so it also bounds spend.
 *   - publish    : 20 req / 1h   per identity (writes a public artifact)
 *
 * Falls back to an in-process token bucket if Upstash isn't configured —
 * fine for dev, NOT safe for production multi-instance deploys.
 */
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export type LimiterName = "interpret" | "generate3d" | "publish";

type LimiterConfig = { tokens: number; window: `${number} ${"s" | "m" | "h"}` };

const FREE_GENERATIONS_PER_DAY = Math.max(
  1,
  Number.parseInt(process.env.YIIYA_FREE_GENERATIONS_PER_DAY ?? "10", 10) || 10
);

const CONFIG: Record<LimiterName, LimiterConfig> = {
  interpret: { tokens: 30, window: "5 m" },
  generate3d: { tokens: FREE_GENERATIONS_PER_DAY, window: "24 h" },
  publish: { tokens: 20, window: "1 h" }
};

function hasUpstash(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

let _redis: Redis | null = null;
function redis(): Redis | null {
  if (!hasUpstash()) return null;
  _redis ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!
  });
  return _redis;
}

const _limiters: Partial<Record<LimiterName, Ratelimit>> = {};
function limiter(name: LimiterName): Ratelimit | null {
  const r = redis();
  if (!r) return null;
  if (!_limiters[name]) {
    const { tokens, window } = CONFIG[name];
    _limiters[name] = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: `yiiya:rl:${name}`,
      analytics: true
    });
  }
  return _limiters[name]!;
}

// In-memory fallback for dev only. Per-process, lost on restart.
const _fallback = new Map<string, { count: number; resetAt: number }>();
function fallbackCheck(name: LimiterName, identity: string) {
  const { tokens, window } = CONFIG[name];
  const windowMs = parseWindowMs(window);
  const key = `${name}:${identity}`;
  const now = Date.now();
  const entry = _fallback.get(key);
  if (!entry || entry.resetAt < now) {
    _fallback.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: tokens - 1, limit: tokens, reset: now + windowMs };
  }
  entry.count += 1;
  const success = entry.count <= tokens;
  return { success, remaining: Math.max(0, tokens - entry.count), limit: tokens, reset: entry.resetAt };
}

function parseWindowMs(w: `${number} ${"s" | "m" | "h"}`): number {
  const [n, unit] = w.split(" ") as [string, "s" | "m" | "h"];
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
  return Number(n) * mult;
}

/**
 * Check (and consume) one token for the given limiter + identity.
 * Identity is typically `${userId}` if authed, otherwise `ip:${hashedIp}`.
 */
export async function checkLimit(name: LimiterName, identity: string) {
  const l = limiter(name);
  if (!l) return fallbackCheck(name, identity);
  const res = await l.limit(identity);
  return {
    success: res.success,
    remaining: res.remaining,
    limit: res.limit,
    reset: res.reset
  };
}

/**
 * Hash an IP into a stable opaque token. Avoids storing plaintext IPs.
 * Uses Web Crypto (Edge-compatible).
 */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`yiiya:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest.slice(0, 8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convenience header writer for Next.js Response objects.
 */
export function rateLimitHeaders(res: {
  limit: number;
  remaining: number;
  reset: number;
}): HeadersInit {
  return {
    "X-RateLimit-Limit": String(res.limit),
    "X-RateLimit-Remaining": String(res.remaining),
    "X-RateLimit-Reset": String(Math.ceil(res.reset / 1000))
  };
}
