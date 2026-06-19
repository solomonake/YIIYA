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
      try { await import("./sentry.server.config"); } catch { /* Sentry not available */ }
    }
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      try { await import("./lib/telemetry/tracer"); } catch { /* OTEL not available */ }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    if (process.env.SENTRY_DSN) {
      try { await import("./sentry.edge.config"); } catch { /* Sentry not available */ }
    }
  }
}

export const onRequestError = process.env.SENTRY_DSN
  ? async (err: unknown, request: unknown, context: unknown) => {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureRequestError(err, request as never, context as never);
      } catch { /* Sentry not available */ }
    }
  : undefined;
