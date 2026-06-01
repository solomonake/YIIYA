/**
 * POST /api/scene/generate
 *
 * The user-facing entry to the 3D generation pipeline. Streams SSE events
 * (heartbeat, progress, stage_started, stage_completed, result, error) so
 * the client agent state machine never goes silent.
 *
 * Request body (JSON):
 *   {
 *     kind: "text-to-3d" | "image-to-3d",
 *     prompt?: string,
 *     imageUrl?: string,
 *     imageBase64?: string,
 *     imageMime?: string,
 *     intent: "preview" | "final"
 *   }
 *
 * Security:
 *   - Rate-limited by Upstash (5 req/h per identity).
 *   - Prompt firewall on text inputs.
 *   - Image moderation on uploaded images.
 *   - Daily USD budget guard per user.
 */
import { NextRequest } from "next/server";
import { z } from "zod";

import { checkLimit, hashIp, rateLimitHeaders } from "@/lib/security/rate-limit";
import { inspectPrompt } from "@/lib/security/prompt-firewall";
import { moderateImage } from "@/lib/security/content-moderation";
import { checkBudget, recordUsage } from "@/lib/billing/usage-meter";
import { createHeartbeatStream, runStage } from "@/lib/telemetry/heartbeat";
import { textTo3d } from "@/services/scene/text-to-3d";
import { generate3d } from "@/services/scene/providers/router";
import { recordEpisode } from "@/lib/memory/episodic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds — adjust to your Vercel plan

const BodySchema = z.object({
  kind: z.enum(["text-to-3d", "image-to-3d"]),
  prompt: z.string().min(1).max(2000).optional(),
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().max(15_000_000).optional(), // ~11MB raw
  imageMime: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  intent: z.enum(["preview", "final"]).default("preview"),
  sessionId: z.string().optional(),
  userId: z.string().uuid().optional()
});

export async function POST(req: NextRequest) {
  const traceId = req.headers.get("x-yiiya-trace-id") ?? crypto.randomUUID();
  const ip = req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "0.0.0.0";
  const identity = `ip:${await hashIp(ip)}`;

  // Parse + validate.
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return jsonError("invalid_input", err instanceof Error ? err.message : "bad request", 400);
  }
  if (body.kind === "text-to-3d" && !body.prompt) {
    return jsonError("invalid_input", "prompt required for text-to-3d", 400);
  }
  if (body.kind === "image-to-3d" && !body.imageUrl && !body.imageBase64) {
    return jsonError("invalid_input", "image required for image-to-3d", 400);
  }

  // Rate limit.
  const rl = await checkLimit("generate3d", body.userId ? `user:${body.userId}` : identity);
  if (!rl.success) {
    return new Response(JSON.stringify({ error: "rate_limited", retry_after: rl.reset }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...rateLimitHeaders(rl) }
    });
  }

  // Budget gate.
  const budget = await checkBudget(body.userId);
  if (!budget.allow) {
    return jsonError(
      "budget_exceeded",
      `Daily ${budget.scope} budget reached ($${budget.spentUsd.toFixed(2)} / $${budget.capUsd.toFixed(2)})`,
      402
    );
  }

  // Prompt firewall (text only).
  if (body.prompt) {
    const verdict = await inspectPrompt(body.prompt);
    if (!verdict.allow) return jsonError("blocked_by_firewall", verdict.reason ?? "blocked", 451);
    body.prompt = verdict.sanitized;
  }

  // Image moderation.
  if (body.imageBase64) {
    const verdict = await moderateImage(body.imageBase64, body.imageMime ?? "image/png");
    if (!verdict.allow) return jsonError("blocked_by_moderation", verdict.reason ?? "blocked", 451);
  }

  // Stream the pipeline.
  const writer = createHeartbeatStream(1000);
  const response = new Response(writer.stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...rateLimitHeaders(rl),
      "x-yiiya-trace-id": traceId
    }
  });

  // Fire off the pipeline in the background so the stream returns immediately.
  void runPipeline(body, traceId, writer);

  return response;
}

async function runPipeline(
  body: z.infer<typeof BodySchema>,
  traceId: string,
  writer: ReturnType<typeof createHeartbeatStream>
) {
  const start = Date.now();
  try {
    const result = await runStage(writer, "generate3d", async () => {
      if (body.kind === "text-to-3d") {
        const out = await textTo3d({
          prompt: body.prompt!,
          intent: body.intent,
          userId: body.userId,
          sessionId: body.sessionId,
          traceId
        });
        if (!out.ok) throw new Error(out.reason);
        return out.result;
      }
      const out = await generate3d({
        kind: "image-to-3d",
        imageUrl: body.imageUrl,
        imageBase64: body.imageBase64,
        imageMime: body.imageMime,
        intent: body.intent,
        pbr: true,
        transparency: false,
        userId: body.userId,
        sessionId: body.sessionId,
        traceId,
        budgetMs: 120_000
      });
      if (!out.ok) throw new Error("all_providers_failed");
      return out.result;
    });

    writer.emit({ kind: "result", data: result });

    // Memory: record this prompt+intent.
    if (body.userId && body.prompt) {
      await recordEpisode({
        userId: body.userId,
        sessionId: body.sessionId,
        eventKind: "prompt",
        promptText: body.prompt,
        resolvedIntent: { kind: body.kind, intent: body.intent, glbUrl: result.glbUrl },
        outcome: "accepted",
        context: { traceId, provider: result.provider }
      });
    }

    await recordUsage({
      userId: body.userId,
      sessionId: body.sessionId,
      traceId,
      stage: "generate3d",
      provider: result.provider,
      latencyMs: Date.now() - start,
      success: true,
      metadata: { kind: body.kind, intent: body.intent }
    });
  } catch (err) {
    writer.emit({
      kind: "error",
      code: "pipeline_failed",
      message: err instanceof Error ? err.message : "unknown"
    });
  } finally {
    writer.close();
  }
}

function jsonError(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
