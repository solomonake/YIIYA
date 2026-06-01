/**
 * OpenTelemetry tracer registration for the Node runtime.
 * Loaded by instrumentation.ts when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 *
 * Backends:
 *   - Langfuse cloud:  https://cloud.langfuse.com/api/public/otel
 *   - Self-hosted:     https://langfuse.com/self-hosting
 *   - Generic OTLP:    any collector that accepts HTTP/protobuf
 *
 * Uses OpenTelemetry GenAI semantic conventions for LLM spans:
 *   https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  SemanticResourceAttributes
} from "@opentelemetry/semantic-conventions";

let _started = false;

export function startTracer(): NodeSDK | null {
  if (_started) return null;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return null;

  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
  if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
    const auth = Buffer.from(
      `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`
    ).toString("base64");
    headers.Authorization = `Basic ${auth}`;
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "yiiya",
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.VERCEL_ENV ?? "development"
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint, headers })
  });

  try {
    sdk.start();
    _started = true;
    process.on("SIGTERM", () => {
      sdk.shutdown().catch(() => undefined);
    });
    return sdk;
  } catch {
    return null;
  }
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) out[k.trim()] = v.trim();
  }
  return out;
}

// Auto-start when this module is imported by instrumentation.ts.
startTracer();
