"use client";
import { createAnalytics, type AnalyticsEvent } from "./core";
let instance: ReturnType<typeof createAnalytics> | null = null;
export function browserAnalytics() {
  if (typeof window === "undefined") return null;
  instance ??= createAnalytics({
    enabled: process.env.NODE_ENV === "production" && window.location.hostname === "yiiya.vercel.app"
      && process.env.NEXT_PUBLIC_YIIYA_ANALYTICS_ENABLED !== "false",
    token: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_TOKEN ?? "",
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "",
    storage: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) },
    privacyBlocked: () => navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
    randomId: () => window.crypto.randomUUID(), fetch: (url, options) => window.fetch(url, options)
  });
  return instance;
}
export function trackProductEvent(event: AnalyticsEvent, format?: unknown) {
  browserAnalytics()?.capture(event, window.location.pathname, { format });
}
