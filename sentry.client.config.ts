/**
 * Sentry client-side configuration.
 * Loaded automatically by @sentry/nextjs on browser entry.
 *
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.replayIntegration({
        // Mask everything by default; users may type sensitive things into voice/text input.
        maskAllText: true,
        blockAllMedia: true
      })
    ],
    beforeSend(event) {
      // Drop noisy ResizeObserver warnings.
      if (event.message?.includes("ResizeObserver loop")) return null;
      return event;
    },
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      // Web Speech API throws on cancellation — not actionable.
      "aborted",
      "no-speech"
    ]
  });
}
