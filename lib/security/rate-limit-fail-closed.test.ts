import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() { return {}; }
    limit = limit;
  }
}));

beforeEach(() => {
  vi.resetModules();
  limit.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("production shared rate limiting", () => {
  it("blocks when shared storage is missing", async () => {
    const { checkLimit } = await import("./rate-limit");
    expect(await checkLimit("generate3d", "user:test")).toMatchObject({ success: false, unavailable: true });
    expect(limit).not.toHaveBeenCalled();
  });
  it.each(["timeout", "exception"])("fails closed on shared storage %s", async failure => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-not-a-credential");
    if (failure === "timeout") limit.mockResolvedValue({ success: true, reason: "timeout" });
    else limit.mockRejectedValue(new Error("backend unavailable"));
    const { checkLimit } = await import("./rate-limit");
    expect(await checkLimit("interpret", "user:test")).toMatchObject({ success: false, unavailable: true });
  });
  it("returns a confirmed shared grant", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-not-a-credential");
    limit.mockResolvedValue({ success: true, remaining: 1, limit: 2, reset: 123 });
    const { checkLimit } = await import("./rate-limit");
    expect(await checkLimit("interpret", "user:test")).toEqual({ success: true, remaining: 1, limit: 2, reset: 123, unavailable: false });
  });
});
