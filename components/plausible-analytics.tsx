"use client";

/**
 * Plausible Analytics script tag.
 *
 * Free, cookie-less, GDPR-safe.
 *   https://plausible.io
 *   Self-host: https://github.com/plausible/community-edition
 *
 * Mount once at the published-page root. Reads NEXT_PUBLIC_PLAUSIBLE_DOMAIN.
 * If the env is empty, renders nothing.
 *
 * NB: Plausible relies on document.referrer + window.location only —
 * no localStorage, no fingerprinting, no consent banner required.
 */
import Script from "next/script";

export type PlausibleProps = {
  /** Optional override; defaults to NEXT_PUBLIC_PLAUSIBLE_DOMAIN. */
  domain?: string;
  /** Optional self-hosted endpoint; defaults to https://plausible.io/js/script.js. */
  src?: string;
};

export function PlausibleAnalytics({ domain, src }: PlausibleProps) {
  const dataDomain = domain ?? process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!dataDomain) return null;
  return (
    <Script
      strategy="afterInteractive"
      data-domain={dataDomain}
      src={src ?? "https://plausible.io/js/script.js"}
    />
  );
}

/**
 * Helper to fire custom events (e.g. "publish", "ar-launched", "remix-clicked").
 *   plausibleEvent("publish", { props: { tier: "free" } })
 */
export function plausibleEvent(name: string, options?: { props?: Record<string, string | number | boolean> }) {
  if (typeof window === "undefined") return;
  const p = (window as unknown as { plausible?: (e: string, o?: unknown) => void }).plausible;
  if (typeof p === "function") p(name, options);
}
