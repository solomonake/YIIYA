/**
 * Thin helpers around the OpenTelemetry API that bake in YIIYA's
 * GenAI semantic conventions. Safe to import from any runtime — if the
 * tracer hasn't been registered, the calls are no-ops.
 *
 * GenAI semconv reference:
 *   https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

const TRACER_NAME = "yiiya";

export function tracer() {
  return trace.getTracer(TRACER_NAME);
}

export type LlmSpanAttrs = {
  system: "gemini" | "anthropic" | "openai" | "tripo" | "huggingface";
  model: string;
  stage: string;
  userIdHash?: string;
  sessionId?: string;
  promptTokens?: number;
  completionTokens?: number;
  temperature?: number;
};

export async function withLlmSpan<T>(
  name: string,
  attrs: LlmSpanAttrs,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer().startActiveSpan(name, async (span) => {
    span.setAttributes({
      "gen_ai.system": attrs.system,
      "gen_ai.request.model": attrs.model,
      "gen_ai.request.temperature": attrs.temperature ?? 0,
      "yiiya.stage": attrs.stage,
      "yiiya.user_id_hash": attrs.userIdHash ?? "anon",
      "yiiya.session_id": attrs.sessionId ?? ""
    });
    try {
      const out = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errMessage(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean | undefined>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer().startActiveSpan(name, async (span) => {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined) span.setAttribute(k, v as string | number | boolean);
    }
    try {
      const out = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errMessage(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}
