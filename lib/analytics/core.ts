export const CONSENT_KEY = "yiiya.analytics-consent.v1";
export type Consent = "granted" | "denied" | "unset";
export type DeliveryStatus = "disabled" | "not_configured" | "privacy_blocked" | "no_consent" | "idle" | "sending" | "accepted" | "rejected" | "network_error";
export type AnalyticsEvent = "$pageview" | "studio_generation_requested" | "export_requested";
const FORMATS = new Set(["glb", "obj", "usd", "usdz", "stl", "fbx"]);
export function allowedRoute(path: string): string | null {
  const clean = path.split(/[?#]/, 1)[0];
  if (["/", "/app", "/library", "/view", "/capture"].includes(clean)) return clean;
  if (/^\/scan\/[^/]+$/.test(clean)) return "/scan/:id";
  return null;
}
export function createAnalytics(options: {
  enabled: boolean; token: string; host: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  privacyBlocked: () => boolean; randomId: () => string; fetch: typeof fetch;
}) {
  const endpoint = options.host === "https://us.i.posthog.com" ? `${options.host}/i/v0/e/` : null;
  const configured = options.enabled && !!endpoint && /^[A-Za-z0-9_-]{16,200}$/.test(options.token);
  let locallyDenied = false;
  let visitId: string | null = null;
  let lastPage: string | null = null;
  let sent = 0;
  let delivery: DeliveryStatus = "idle";
  let revision = 0;
  function status(): DeliveryStatus {
    if (!options.enabled) return "disabled";
    if (!configured) return "not_configured";
    if (options.privacyBlocked()) return "privacy_blocked";
    if (consent() !== "granted") return "no_consent";
    return delivery;
  }
  const pending = new Map<AbortController, ReturnType<typeof setTimeout>>();
  function consent(): Consent {
    if (locallyDenied) return "denied";
    try {
      const value = options.storage.getItem(CONSENT_KEY);
      return value === "granted" || value === "denied" ? value : "unset";
    } catch { return "unset"; }
  }
  function stop() {
    revision++; delivery = "idle";
    pending.forEach((timeout, controller) => { clearTimeout(timeout); controller.abort(); }); pending.clear();
    visitId = null; lastPage = null;
  }
  function syncConsent() {
    if (consent() !== "granted" || options.privacyBlocked()) stop();
  }
  function setConsent(value: "granted" | "denied"): boolean {
    if (value === "denied") { locallyDenied = true; stop(); }
    try { options.storage.setItem(CONSENT_KEY, value); }
    catch { stop(); return false; }
    locallyDenied = value === "denied";
    syncConsent();
    return true;
  }
  function capture(event: AnalyticsEvent, pathname: string, input: { format?: unknown } = {}): void {
    syncConsent();
    if (!configured || options.privacyBlocked() || consent() !== "granted" || sent >= 50) return;
    const route = allowedRoute(pathname);
    if (!route || !["$pageview", "studio_generation_requested", "export_requested"].includes(event)) return;
    if (event === "$pageview" && lastPage === route) return;
    if (event !== "$pageview" && route !== "/app") return;
    if (event === "export_requested" && (typeof input.format !== "string" || !FORMATS.has(input.format))) return;
    try {
      visitId ??= options.randomId();
      if (!/^[A-Za-z0-9-]{16,64}$/.test(visitId)) { stop(); return; }
      const properties = { route, $pathname: route, schema_version: 1,
        $process_person_profile: false, $geoip_disable: true,
        ...(event === "export_requested" ? { format: input.format } : {}) };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      pending.set(controller, timeout);
      if (event === "$pageview") lastPage = route;
      sent++;
      const requestRevision = ++revision;
      delivery = "sending";
      // No SDK, automatic properties, retry queue, cookies, referrer or redirects.
      void options.fetch(endpoint!, { method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
        redirect: "error", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: options.token, distinct_id: visitId, event, properties })
      }).then(response => {
        if (requestRevision === revision) delivery = response.ok ? "accepted" : "rejected";
      }).catch(() => {
        if (requestRevision === revision) delivery = "network_error";
      }).finally(() => { clearTimeout(timeout); pending.delete(controller); });
    } catch { stop(); /* Optional telemetry must never break a Studio action. */ }
  }
  return { consent, setConsent, syncConsent, capture, stop, status };
}
