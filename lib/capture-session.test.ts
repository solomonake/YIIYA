import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_SESSION_VIEWS,
  SESSION_TTL_SECONDS,
  createSession,
  generateSessionId,
  getSession,
  putSession,
  submitSessionViews,
  type CaptureSessionData
} from "@/lib/capture-session";

// These tests exercise the in-memory fallback path (no UPSTASH_* env), which is
// the same code path dev and CI run on. The Redis branch is a thin passthrough.

function resetStore() {
  (
    globalThis as typeof globalThis & {
      __yiiyaCaptureSessions?: Map<string, unknown>;
    }
  ).__yiiyaCaptureSessions = new Map();
}

describe("capture-session store", () => {
  beforeEach(() => {
    resetStore();
    // Belt-and-suspenders: ensure the Redis branch stays off in tests.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates opaque, unique, url-safe ids", () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });

  it("createSession stores a pending session with no views", async () => {
    const { id, data } = await createSession();
    expect(data.status).toBe("pending");
    expect(data.views).toEqual([]);

    const fetched = await getSession(id);
    expect(fetched?.status).toBe("pending");
    expect(fetched?.views).toEqual([]);
  });

  it("getSession returns null for an unknown id", async () => {
    expect(await getSession("does-not-exist")).toBeNull();
  });

  it("submitSessionViews attaches views and flips status to ready", async () => {
    const { id } = await createSession();
    const views = ["https://blob/front.png", "https://blob/left.png", "https://blob/back.png"];

    const updated = await submitSessionViews(id, views);
    expect(updated?.status).toBe("ready");
    expect(updated?.views).toEqual(views);

    const fetched = await getSession(id);
    expect(fetched?.status).toBe("ready");
    expect(fetched?.views).toEqual(views);
  });

  it("submitSessionViews returns null for a missing/expired session", async () => {
    expect(await submitSessionViews("gone", ["https://blob/a.png"])).toBeNull();
  });

  it("submitSessionViews drops empty entries and stays pending if none remain", async () => {
    const { id } = await createSession();
    const updated = await submitSessionViews(id, ["", "   "].map((s) => s.trim()));
    // All entries filtered out -> no valid views -> still pending.
    expect(updated?.status).toBe("pending");
    expect(updated?.views).toEqual([]);
  });

  it("putSession truncates views beyond MAX_SESSION_VIEWS", async () => {
    const now = Date.now();
    const tooMany = Array.from({ length: MAX_SESSION_VIEWS + 5 }, (_, i) => `https://blob/${i}.png`);
    const data: CaptureSessionData = {
      status: "ready",
      views: tooMany,
      createdAt: now,
      updatedAt: now
    };
    await putSession("cap1", data);

    const fetched = await getSession("cap1");
    expect(fetched?.views).toHaveLength(MAX_SESSION_VIEWS);
  });

  it("expires a session after its TTL in the fallback path", async () => {
    vi.useFakeTimers();
    const { id } = await createSession();
    expect(await getSession(id)).not.toBeNull();

    // Advance just past the TTL window.
    vi.advanceTimersByTime(SESSION_TTL_SECONDS * 1000 + 1);
    expect(await getSession(id)).toBeNull();
  });

  it("returns null for a structurally invalid stored record", async () => {
    // Simulate a corrupt/foreign value landing in the store (bad deploy, schema
    // drift, someone else writing the key). getSession must not hand it back.
    (
      globalThis as typeof globalThis & {
        __yiiyaCaptureSessions?: Map<string, { data: unknown; expiresAt: number }>;
      }
    ).__yiiyaCaptureSessions?.set("bad", {
      data: { status: "weird", views: "not-an-array" },
      expiresAt: Date.now() + 10_000
    });
    expect(await getSession("bad")).toBeNull();
  });
});
