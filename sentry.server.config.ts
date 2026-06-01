/**
 * Sentry server-side configuration.
 * Loaded by instrumentation.ts on the Node runtime.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Don't capture HTTP body — may contain user prompts.
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrub user transcripts before they reach Sentry.
      if (event.request?.data && typeof event.request.data === "object") {
        const data = event.request.data as Record<string, unknown>;
        for (const key of ["transcript", "prompt", "voice", "text"]) {
          if (typeof data[key] === "string") data[key] = "[scrubbed]";
        }
      }
      return event;
    }
  });
}
