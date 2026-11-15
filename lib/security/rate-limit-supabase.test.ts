import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-rest", () => ({
  isSupabaseRestConfigured: () => true, supabaseRestFetch: rpc
}));
beforeEach(() => {
  vi.resetModules(); rpc.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});
afterEach(() => vi.unstubAllEnvs());
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe("Supabase shared rate limiter", () => {
  it("hashes identities and accepts only a validated shared grant", async () => {
    const reset = Date.now() + 300000;
    rpc.mockResolvedValue(reply({ success: true, remaining: 29, limit: 30, reset }));
    const { checkLimit } = await import("./rate-limit");
    expect(await checkLimit("interpret", "user:private-id")).toEqual({ success: true, remaining: 29, limit: 30, reset, unavailable: false });
    const [path, options, role] = rpc.mock.calls[0];
    expect(path).toBe("rpc/consume_rate_limit"); expect(role).toBe("service");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ p_name: "interpret", p_tokens: 30, p_window_ms: 300000 });
    expect(body.p_identity_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(options.body).not.toContain("private-id"); expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("preserves confirmed quota denial", async () => {
    rpc.mockResolvedValue(reply({ success: false, remaining: 0, limit: 10, reset: Date.now() + 86400000 }));
    const { checkLimit } = await import("./rate-limit");
    expect(await checkLimit("generate3d", "test")).toMatchObject({ success: false, unavailable: false, remaining: 0 });
  });
  it.each([null, {}, { success: true, remaining: -1, limit: 30, reset: 1 },
    { success: false, remaining: 1, limit: 30, reset: 9999999999999 },
    { success: true, remaining: 29, limit: 300, reset: 9999999999999 },
    { success: true, remaining: 29.5, limit: 30, reset: 9999999999999 }])("fails closed for malformed reply %#", async value => {
    rpc.mockResolvedValue(reply(value));
    const { checkLimit } = await import("./rate-limit");
    expect(await checkLimit("interpret", "test")).toMatchObject({ success: false, unavailable: true });
  });
  it.each(["HTTP", "timeout", "JSON"])("fails closed without a memory grant on %s failure", async failure => {
    if (failure === "HTTP") rpc.mockResolvedValue(reply({}, 503));
    if (failure === "timeout") rpc.mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
    if (failure === "JSON") rpc.mockResolvedValue(new Response("not json"));
    const { checkLimit } = await import("./rate-limit");
    expect(await checkLimit("interpret", "test")).toMatchObject({ success: false, unavailable: true });
  });
});
