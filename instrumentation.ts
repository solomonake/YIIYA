/**
 * Next.js instrumentation hook.
 * Runs once per server lifecycle (Node + Edge runtimes both fire).
 * Wires Sentry + OpenTelemetry before any route handlers execute.
 *
 * Reference: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.SENTRY_DSN) {
      await import("./sentry.server.config");
    }
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      await import("./lib/telemetry/tracer");
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    if (process.env.SENTRY_DSN) {
      await import("./sentry.edge.config");
    }
  }
}

export const onRequestError = process.env.SENTRY_DSN
  ? // Re-export Sentry's onRequestError when DSN is configured (Next 15 feature).
    // Kept lazy so the import isn't pulled into the edge bundle when not needed.
    async (err: unknown, request: unknown, context: unknown) => {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureRequestError(err, request as never, context as never);
    }
  : undefined;
