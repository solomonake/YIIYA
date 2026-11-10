"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { browserAnalytics } from "@/lib/analytics/browser";
import { CONSENT_KEY, type Consent, type DeliveryStatus } from "@/lib/analytics/core";

export function AnalyticsConsent() {
  const path = usePathname();
  const [consent, setConsent] = useState<Consent>("unset");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<DeliveryStatus>("idle");
  useEffect(() => {
    if (!open) return;
    const refresh = () => setDelivery(browserAnalytics()?.status() ?? "disabled");
    refresh();
    const timer = setInterval(refresh, 500);
    return () => clearInterval(timer);
  }, [open, consent]);
  useEffect(() => {
    const analytics = browserAnalytics();
    const current = analytics?.consent() ?? "unset";
    setConsent(current); setReady(true); setOpen(current === "unset");
    const sync = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) {
        analytics?.syncConsent(); setConsent(analytics?.consent() ?? "unset");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { if (ready && consent === "granted" && path) browserAnalytics()?.capture("$pageview", path); }, [path, ready, consent]);
  function choose(value: "granted" | "denied") {
    if (!browserAnalytics()?.setConsent(value)) { setError("Could not save your choice. Analytics stays off."); return; }
    setConsent(value); setError(""); setOpen(false);
  }
  if (!ready) return null;
  return <aside aria-label="Analytics preferences" className="fixed bottom-3 right-3 z-[100] max-w-[calc(100vw-24px)] text-sm">
    {open ? <section aria-labelledby="analytics-title" className="w-80 max-w-full rounded-lg border border-zinc-600 bg-zinc-950 p-4 text-zinc-100 shadow-lg">
      <h2 id="analytics-title" className="font-semibold">Optional usage analytics</h2>
      <p className="mt-2 text-zinc-300">Allow anonymous page, Studio request and export counts through PostHog? We exclude your prompts, photos, voice, email and link tokens.</p>
      <p className="mt-2 text-xs text-zinc-400">No recordings. You can turn this off anytime. Browser privacy signals are respected.</p>
      <p className="mt-2 text-xs text-zinc-300" role="status" data-analytics-status={delivery}>
        {delivery === "privacy_blocked" ? "Your browser privacy preference keeps analytics off."
          : delivery === "disabled" || delivery === "not_configured" ? "Usage analytics is currently unavailable."
          : delivery === "rejected" || delivery === "network_error" ? "Usage analytics could not connect. You can keep using the Studio."
          : consent === "granted" ? "Usage analytics is allowed."
          : "Usage analytics is off."}
      </p>
      {error && <p role="alert" className="mt-2 text-amber">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose("denied")} className="min-h-11 flex-1 rounded border border-zinc-500 px-3">{consent === "granted" ? "Turn off" : "No thanks"}</button>
        <button type="button" onClick={() => choose("granted")} className="min-h-11 flex-1 rounded bg-amber px-3 font-semibold text-zinc-950">Allow</button>
      </div>
      {consent !== "unset" && <button type="button" onClick={() => setOpen(false)} className="mt-2 min-h-11 w-full text-zinc-300">Close preferences</button>}
    </section> : <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded border border-zinc-600 bg-zinc-950 px-3 text-zinc-200">Analytics preferences</button>}
  </aside>;
}
