/**
 * Phone-companion capture session store.
 *
 * Backs the "Orbit with phone" flow: a laptop `/app` user creates a session and
 * shows its id in a QR; their phone opens `/capture?session=<id>`, runs the
 * existing orbit, and POSTs the finished view URLs back. The laptop polls until
 * the session flips to `ready`, then auto-generates from the orbit views.
 *
 * Storage is Upstash Redis (already wired for rate limiting — see
 * `lib/security/rate-limit.ts`) with a short TTL. Falls back to a per-process
 * in-memory map when Upstash isn't configured — fine for dev/tests, NOT safe for
 * a multi-instance deploy (a session created on one instance is invisible to the
 * next), which is exactly why production must have Upstash keys set.
 *
 * We store view *URLs* only (Vercel Blob https links), never base64 — the KV
 * value stays tiny and well under Upstash's per-value limits.
 */
import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";

/** How long a session lives before Redis evicts it. Orbit + poll is seconds. */
export const SESSION_TTL_SECONDS = 600;

/** Hard cap on stored views — the orbit produces exactly front/left/back. */
export const MAX_SESSION_VIEWS = 8;

export type CaptureSessionStatus = "pending" | "ready";

export interface CaptureSessionData {
  status: CaptureSessionStatus;
  /** Public https view URLs (Blob). Empty until the phone submits. */
  views: string[];
  createdAt: number;
  updatedAt: number;
}

const KEY_PREFIX = "yiiya:cap:";

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function hasUpstash(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
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

// In-memory fallback for dev/tests. Per-process, lost on restart, invisible to
// other instances. Kept on globalThis so Next.js HMR doesn't drop live sessions.
type FallbackEntry = { data: CaptureSessionData; expiresAt: number };
const globalStore = globalThis as typeof globalThis & {
  __yiiyaCaptureSessions?: Map<string, FallbackEntry>;
};
function fallbackStore(): Map<string, FallbackEntry> {
  if (!globalStore.__yiiyaCaptureSessions) {
    globalStore.__yiiyaCaptureSessions = new Map();
  }
  return globalStore.__yiiyaCaptureSessions;
}

function isValidData(value: unknown): value is CaptureSessionData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === "pending" || v.status === "ready") &&
    Array.isArray(v.views) &&
    v.views.every((u) => typeof u === "string") &&
    typeof v.createdAt === "number" &&
    typeof v.updatedAt === "number"
  );
}

/**
 * Generate an opaque, URL-safe session id. This is the only secret in the QR
 * URL; it carries no user data and expires with the session.
 */
export function generateSessionId(): string {
  return nanoid(21);
}

/**
 * Create a new pending session and return its id. Nothing is generated yet —
 * the phone fills in views later via `putSession`.
 */
export async function createSession(): Promise<{ id: string; data: CaptureSessionData }> {
  const id = generateSessionId();
  const now = Date.now();
  const data: CaptureSessionData = {
    status: "pending",
    views: [],
    createdAt: now,
    updatedAt: now
  };
  await putSession(id, data);
  return { id, data };
}

/**
 * Persist the full session record with a fresh TTL. Callers pass the complete
 * `CaptureSessionData` (read-modify-write); there is no partial patch to keep
 * the KV semantics trivial. Views are truncated to `MAX_SESSION_VIEWS`.
 */
export async function putSession(id: string, data: CaptureSessionData): Promise<void> {
  const sanitized: CaptureSessionData = {
    status: data.status,
    views: data.views.filter((u) => typeof u === "string").slice(0, MAX_SESSION_VIEWS),
    createdAt: data.createdAt,
    updatedAt: Date.now()
  };

  const r = redis();
  if (r) {
    await r.set(keyFor(id), sanitized, { ex: SESSION_TTL_SECONDS });
    return;
  }

  fallbackStore().set(id, {
    data: sanitized,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  });
}

/**
 * Fetch a session, or null if it never existed or has expired. Expiry in the
 * fallback path is enforced here (Redis evicts on its own).
 */
export async function getSession(id: string): Promise<CaptureSessionData | null> {
  const r = redis();
  if (r) {
    const raw = await r.get(keyFor(id));
    return isValidData(raw) ? raw : null;
  }

  const entry = fallbackStore().get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    fallbackStore().delete(id);
    return null;
  }
  return isValidData(entry.data) ? entry.data : null;
}

/**
 * Attach the phone's finished orbit views to a pending session and flip it to
 * `ready`. Returns the updated record, or null if the session is gone/expired.
 * Read-modify-write over `getSession`/`putSession` so it works on both backends.
 */
export async function submitSessionViews(
  id: string,
  views: string[]
): Promise<CaptureSessionData | null> {
  const current = await getSession(id);
  if (!current) return null;

  const cleaned = views
    .filter((u) => typeof u === "string" && u.length > 0)
    .slice(0, MAX_SESSION_VIEWS);

  const next: CaptureSessionData = {
    ...current,
    status: cleaned.length > 0 ? "ready" : current.status,
    views: cleaned
  };
  await putSession(id, next);
  return next;
}
