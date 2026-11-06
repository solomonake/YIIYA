import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY, allowedRoute, createAnalytics } from "./core";
let values: Map<string, string>;
let send: ReturnType<typeof vi.fn>;
let storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
function client(overrides: Partial<Parameters<typeof createAnalytics>[0]> = {}) {
  return createAnalytics({ enabled: true, host: "https://us.i.posthog.com", token: "phc_test_public_key_only",
    storage, privacyBlocked: () => false, randomId: () => "12345678-1234-1234-1234-123456789abc", fetch: send as typeof fetch, ...overrides });
}
beforeEach(() => { values = new Map(); send = vi.fn().mockResolvedValue(new Response("ok"));
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }; });
afterEach(() => vi.useRealTimers());
describe("consent-only minimal capture", () => {
  it("sends nothing before consent or after refusal", () => {
    const analytics = client(); analytics.capture("$pageview", "/app");
    analytics.setConsent("denied"); analytics.capture("studio_generation_requested", "/app");
    expect(send).not.toHaveBeenCalled();
  });
  it("serializes only allowlisted routes/properties, never content or URLs", () => {
    const analytics = client(); analytics.setConsent("granted");
    analytics.capture("$pageview", "/scan/private-job?email=person@example.com#scanToken=secret");
    analytics.capture("export_requested", "/app?prompt=secret#token", { format: "glb", prompt: "private prompt", photo: "private image" } as { format: string });
    const payloads = send.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(payloads[0].properties).toEqual({ route: "/scan/:id", $pathname: "/scan/:id", schema_version: 1, $process_person_profile: false, $geoip_disable: true });
    expect(payloads[1].properties.format).toBe("glb");
    const serialized = JSON.stringify(payloads);
    for (const forbidden of ["secret", "private", "example.com", "$current_url", "$referrer", "photo", "prompt", "token"]) expect(serialized).not.toContain(forbidden);
    expect(send.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
  });
  it("aborts in-flight events and denies future events after revocation", () => {
    send.mockImplementation(() => new Promise(() => undefined));
    const analytics = client(); analytics.setConsent("granted"); analytics.capture("$pageview", "/app");
    const signal = send.mock.calls[0][1].signal as AbortSignal;
    analytics.setConsent("denied"); analytics.capture("export_requested", "/app", { format: "obj" });
    expect(signal.aborted).toBe(true); expect(send).toHaveBeenCalledTimes(1);
  });
  it("revocation stays denied even if local storage writes fail", () => {
    values.set(CONSENT_KEY, "granted");
    const analytics = client({ storage: { getItem: storage.getItem, setItem: () => { throw new Error("blocked"); } } });
    expect(analytics.setConsent("denied")).toBe(false);
    analytics.capture("$pageview", "/app"); expect(send).not.toHaveBeenCalled();
  });
  it("honors cross-tab revocation and privacy signals", () => {
    const analytics = client(); analytics.setConsent("granted"); values.set(CONSENT_KEY, "denied");
    analytics.syncConsent(); analytics.capture("$pageview", "/app");
    const blocked = client({ privacyBlocked: () => true }); blocked.setConsent("granted"); blocked.capture("$pageview", "/app");
    expect(send).not.toHaveBeenCalled();
  });
  it.each([{ enabled: false }, { host: "https://untrusted.test" }, { token: "" }])("disables invalid or nonproduction transport %#", options => {
    const analytics = client(options); analytics.setConsent("granted"); analytics.capture("$pageview", "/app"); expect(send).not.toHaveBeenCalled();
  });
  it("rejects unknown events, routes and formats", () => {
    const analytics = client(); analytics.setConsent("granted");
    analytics.capture("$identify" as "$pageview", "/app"); analytics.capture("$pageview", "/unreviewed");
    analytics.capture("export_requested", "/app", { format: "https://secret.test" });
    analytics.capture("studio_generation_requested", "/capture"); expect(send).not.toHaveBeenCalled();
  });
  it("deduplicates same-route pageviews and bounds each page lifetime", () => {
    const analytics = client(); analytics.setConsent("granted"); analytics.capture("$pageview", "/app"); analytics.capture("$pageview", "/app#secret");
    expect(send).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++) analytics.capture("studio_generation_requested", "/app");
    expect(send).toHaveBeenCalledTimes(50);
  });
  it("fails closed if consent cannot be read", () => {
    const analytics = client({ storage: { ...storage, getItem: () => { throw new Error("blocked"); } } });
    analytics.capture("$pageview", "/app"); expect(send).not.toHaveBeenCalled();
  });
  it("does not retry failed network requests or break callers", async () => {
    send.mockRejectedValue(new Error("offline"));
    const analytics = client(); analytics.setConsent("granted");
    expect(() => analytics.capture("$pageview", "/app")).not.toThrow();
    await Promise.resolve(); expect(send).toHaveBeenCalledTimes(1);
  });
});
it("never accepts a full URL as a route", () => { expect(allowedRoute("https://yiiya.vercel.app/app?secret")).toBeNull(); });

describe("local delivery diagnosis", () => {
  it("distinguishes guards without sending any data", () => {
    expect(client({ enabled: false }).status()).toBe("disabled");
    expect(client({ token: "" }).status()).toBe("not_configured");
    expect(client({ privacyBlocked: () => true }).status()).toBe("privacy_blocked");
    expect(client().status()).toBe("no_consent");
    expect(send).not.toHaveBeenCalled();
  });
  it.each([200, 400, 429, 500])("reports HTTP %s independently of caller success", async code => {
    send.mockResolvedValue(new Response("unused response body", { status: code }));
    const analytics = client(); analytics.setConsent("granted");
    expect(analytics.status()).toBe("idle");
    analytics.capture("$pageview", "/");
    expect(analytics.status()).toBe("sending");
    await vi.waitFor(() => expect(analytics.status()).toBe(code === 200 ? "accepted" : "rejected"));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("reports network failure without retries or response content", async () => {
    send.mockRejectedValue(new Error("private transport detail"));
    const analytics = client(); analytics.setConsent("granted"); analytics.capture("$pageview", "/");
    await vi.waitFor(() => expect(analytics.status()).toBe("network_error"));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("ignores an old completion after revocation and re-consent", async () => {
    let complete!: (response: Response) => void;
    send.mockImplementation(() => new Promise<Response>(resolve => { complete = resolve; }));
    const analytics = client(); analytics.setConsent("granted"); analytics.capture("$pageview", "/");
    analytics.setConsent("denied"); expect(analytics.status()).toBe("no_consent");
    analytics.setConsent("granted"); complete(new Response("ok"));
    await Promise.resolve(); await Promise.resolve();
    expect(analytics.status()).toBe("idle");
  });
  it("a late earlier failure cannot override the latest acceptance", async () => {
    let fail!: (error: Error) => void;
    send.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const analytics = client(); analytics.setConsent("granted"); analytics.capture("$pageview", "/");
    analytics.capture("$pageview", "/app");
    await vi.waitFor(() => expect(analytics.status()).toBe("accepted"));
    fail(new Error("offline")); await Promise.resolve(); await Promise.resolve();
    expect(analytics.status()).toBe("accepted");
  });
});
