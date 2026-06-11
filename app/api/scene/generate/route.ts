import { NextRequest } from "next/server";
import { z } from "zod";

import { checkLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { inspectPrompt } from "@/lib/security/prompt-firewall";
import { moderateImage } from "@/lib/security/content-moderation";
import { checkBudget, recordUsage } from "@/lib/billing/usage-meter";
import { createHeartbeatStream, runStage } from "@/lib/telemetry/heartbeat";
import { textTo3d } from "@/services/scene/text-to-3d";
import { generate3d } from "@/services/scene/providers/router";
import { recordEpisode } from "@/lib/memory/episodic";
import { resolveGenerationIdentity } from "@/lib/security/generation-identity";
import { createAssetJob, getAssetJob, replaceAssetArtifacts, updateAssetJob, type AssetArtifact, type AssetValidationCheck } from "@/lib/asset-jobs";
import { compileAssetPlan, type AssetBrief } from "@/lib/asset-compiler";
import { generateCadArtifacts } from "@/services/scene/cad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AssetBriefSchema = z
  .object({
    sourceKind: z.enum(["text", "image", "scan", "mixed"]),
    lane: z.enum(["mesh", "cad", "scan"]),
    destination: z.enum(["cad", "animation", "print", "ar", "portfolio"]),
    objectName: z.string(),
    summary: z.string(),
    functionalIntent: z.string(),
    dimensions: z
      .object({
        unit: z.enum(["mm", "cm", "in"]),
        width: z.number().optional(),
        height: z.number().optional(),
        depth: z.number().optional(),
        diameter: z.number().optional(),
        notes: z.string().optional()
      })
      .optional(),
    constraints: z.array(z.string()),
    partSemantics: z.array(z.string()),
    materialTargets: z.array(z.string()),
    motionTargets: z.array(z.string()),
    exportTargets: z.array(z.enum(["glb", "obj", "fbx", "stl", "3mf", "usdz", "step", "blend", "py", "json", "zip"])),
    qualityTargets: z.object({
      topology: z.enum(["preview", "quad_remesh", "cad_surface"]),
      texture: z.enum(["none", "pbr", "style_preserving"]),
      manufacturable: z.boolean(),
      riggable: z.boolean(),
      cadFriendly: z.boolean()
    }),
    readiness: z.object({
      score: z.number(),
      label: z.enum(["draft", "preview", "handoff"]),
      checks: z.array(
        z.object({
          label: z.string(),
          status: z.enum(["ready", "needs-work", "planned"]),
          detail: z.string().optional()
        })
      )
    }),
    fallbackPolicy: z.object({
      rerouteTo: z.enum(["mesh", "cad", "scan"]).optional(),
      reason: z.string().optional(),
      maxRepairAttempts: z.number()
    })
  })
  .passthrough();

const BodySchema = z.object({
  lane: z.enum(["mesh", "cad"]).optional(),
  kind: z.enum(["text-to-3d", "image-to-3d"]).optional(),
  prompt: z.string().min(1).max(2000).optional(),
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().max(15_000_000).optional(),
  imageMime: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  intent: z.enum(["preview", "final"]).default("preview"),
  sessionId: z.string().optional(),
  jobId: z.string().optional(),
  assetBrief: AssetBriefSchema.optional()
});

type ParsedBody = z.infer<typeof BodySchema>;

export async function POST(req: NextRequest) {
  const traceId = req.headers.get("x-yiiya-trace-id") ?? crypto.randomUUID();
  const identity = await resolveGenerationIdentity(req);

  let body: ParsedBody;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return jsonError("invalid_input", err instanceof Error ? err.message : "bad request", 400);
  }

  if (!body.prompt && !body.imageUrl && !body.imageBase64 && !body.assetBrief) {
    return jsonError("invalid_input", "prompt or image input is required", 400);
  }

  if (!identity.isExempt) {
    const rl = await checkLimit("generate3d", identity.identityKey);
    if (!rl.success) {
      return new Response(JSON.stringify({ error: "rate_limited", retry_after: rl.reset }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...rateLimitHeaders(rl),
          ...(identity.setCookie ? { "Set-Cookie": identity.setCookie } : {})
        }
      });
    }
  }

  if (!identity.isExempt) {
    const budget = await checkBudget(identity.userId);
    if (!budget.allow) {
      return jsonError(
        "budget_exceeded",
        `Daily ${budget.scope} budget reached ($${budget.spentUsd.toFixed(2)} / $${budget.capUsd.toFixed(2)})`,
        402
      );
    }
  }

  if (body.prompt) {
    const verdict = await inspectPrompt(body.prompt);
    if (!verdict.allow) {
      return jsonError("blocked_by_firewall", verdict.reason ?? "blocked", 451);
    }
    body.prompt = verdict.sanitized;
  }

  if (body.imageBase64) {
    const verdict = await moderateImage(body.imageBase64, body.imageMime ?? "image/png");
    if (!verdict.allow) {
      return jsonError("blocked_by_moderation", verdict.reason ?? "blocked", 451);
    }
  }

  const fallbackPlan = compileAssetPlan({
    transcript: body.prompt ?? body.assetBrief?.summary ?? "Generate asset",
    activeLane: body.lane ?? body.assetBrief?.lane ?? null,
    hasReferenceImage: Boolean(body.imageUrl || body.imageBase64),
    hasScanJob: false,
    sceneObjectCount: 0
  });
  const brief = (body.assetBrief as AssetBrief | undefined) ?? fallbackPlan.brief;
  const lane = body.lane ?? brief.lane;

  if (lane === "scan") {
    return jsonError("unsupported_lane", "scan generation must use /api/scan/jobs", 400);
  }

  const job =
    (body.jobId ? getAssetJob(body.jobId) : null) ??
    createAssetJob(
      {
        summary: fallbackPlan.summary,
        brief,
        routePlan: fallbackPlan.routePlan
      },
      body.prompt ?? fallbackPlan.summary.normalizedPrompt
    );

  const writer = createHeartbeatStream(1000);
  const response = new Response(writer.stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "x-yiiya-trace-id": traceId,
      ...(identity.setCookie ? { "Set-Cookie": identity.setCookie } : {})
    }
  });

  void runPipeline({
    body,
    lane,
    brief,
    traceId,
    writer,
    jobId: job.id,
    userId: identity.userId
  });

  return response;
}

async function runPipeline(input: {
  body: ParsedBody;
  lane: "mesh" | "cad";
  brief: AssetBrief;
  traceId: string;
  writer: ReturnType<typeof createHeartbeatStream>;
  jobId: string;
  userId: string | null;
}) {
  const { body, lane, brief, traceId, writer, jobId, userId } = input;
  const start = Date.now();

  try {
    updateAssetJob(jobId, {
      state: "planning",
      phase: "route_plan",
      progress: 0.12,
      warnings: brief.fallbackPolicy.reason ? [brief.fallbackPolicy.reason] : []
    });
    writer.emit({ kind: "progress", stage: "generate3d", pct: 12, note: "route_plan" });

    if (lane === "cad") {
      updateAssetJob(jobId, { state: "previewing", phase: "preview", progress: 0.24 });
      writer.emit({ kind: "progress", stage: "generate3d", pct: 24, note: "cad_preview" });

      const cad = await runStage(writer, "generate3d", async () =>
        generateCadArtifacts({
          prompt: body.prompt ?? brief.summary,
          brief,
          intent: body.intent,
          userId,
          sessionId: body.sessionId,
          traceId
        })
      );

      const validation = normalizeValidation(cad.validation);
      const artifacts = cad.artifacts.map((artifact) => withArtifactUrls(jobId, artifact));
      const resolvedPreviewUrl =
        artifacts.find(
          (artifact) =>
            artifact.kind === "preview" &&
            artifact.format === "glb" &&
            artifact.status === "ready",
        )?.url ?? cad.previewGlbUrl;

      replaceAssetArtifacts(jobId, artifacts);
      updateAssetJob(jobId, {
        state: "complete",
        phase: "handoff",
        progress: 1,
        provider: cad.provider,
        validation,
        warnings: cad.warnings,
        handoff: {
          headline: `${brief.objectName} is ready for CAD review.`,
          notes: cad.handoffNotes
        }
      });

      if (!resolvedPreviewUrl) {
        throw new Error("cad_preview_unavailable");
      }

      writer.emit({
        kind: "result",
        data: {
          glbUrl: resolvedPreviewUrl,
          provider: cad.provider,
          meta: { jobId, artifacts, validation, lane: "cad" }
        }
      });

      await finalizeUsage({
        body,
        traceId,
        userId,
        provider: cad.provider,
        latencyMs: Date.now() - start,
        success: true,
        lane
      });
      return;
    }

    updateAssetJob(jobId, { state: "previewing", phase: "preview", progress: 0.22 });
    writer.emit({ kind: "progress", stage: "generate3d", pct: 22, note: "mesh_preview" });

    const result = await runStage(writer, "generate3d", async () => {
      if ((body.kind ?? (body.imageUrl || body.imageBase64 ? "image-to-3d" : "text-to-3d")) === "text-to-3d") {
        const out = await textTo3d({
          prompt: body.prompt ?? brief.summary,
          intent: body.intent,
          userId,
          sessionId: body.sessionId,
          traceId
        });
        if (!out.ok) {
          throw new Error(out.reason);
        }
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
        userId,
        sessionId: body.sessionId,
        traceId,
        budgetMs: 120_000
      });
      if (!out.ok) {
        throw new Error("all_providers_failed");
      }
      return out.result;
    });

    const artifacts = meshArtifactsFromResult(jobId, brief, result, body.intent);
    const validation = meshValidation(brief, result.meta);

    replaceAssetArtifacts(jobId, artifacts);
    updateAssetJob(jobId, {
      state: "complete",
      phase: "handoff",
      progress: 1,
      provider: result.provider,
      validation,
      handoff: {
        headline: `${brief.objectName} is ready for asset handoff.`,
        notes: [
          "Use the GLB preview for quick review.",
          "Final exports depend on the provider metadata currently returned."
        ]
      }
    });

    writer.emit({
      kind: "result",
      data: {
        glbUrl: result.glbUrl,
        provider: result.provider,
        meta: { jobId, artifacts, validation, lane: "mesh" }
      }
    });

    if (userId && body.prompt) {
      await recordEpisode({
        userId,
        sessionId: body.sessionId,
        eventKind: "prompt",
        promptText: body.prompt,
        resolvedIntent: { lane, intent: body.intent, glbUrl: result.glbUrl },
        outcome: "accepted",
        context: { traceId, provider: result.provider }
      });
    }

    await finalizeUsage({
      body,
      traceId,
      userId,
      provider: result.provider,
      latencyMs: Date.now() - start,
      success: true,
      lane
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    updateAssetJob(input.jobId, {
      state: "failed",
      phase: "handoff",
      progress: 1,
      error: message
    });
    writer.emit({
      kind: "error",
      code: "pipeline_failed",
      message
    });
    await finalizeUsage({
      body,
      traceId,
      userId,
      provider: lane === "cad" ? "cad-worker" : "mesh-router",
      latencyMs: Date.now() - start,
      success: false,
      lane,
      errorCode: "pipeline_failed"
    });
  } finally {
    writer.close();
  }
}

function withArtifactUrls(jobId: string, artifact: AssetArtifact): AssetArtifact {
  if (
    artifact.url ||
    (!artifact.inlineText && artifact.inlineJson === undefined && !artifact.inlineBase64)
  ) {
    return artifact;
  }

  return {
    ...artifact,
    url: `/api/asset-jobs/${jobId}/artifacts/${artifact.id}`
  };
}

function meshArtifactsFromResult(
  jobId: string,
  brief: AssetBrief,
  result: { glbUrl: string; provider: string; meta: Record<string, unknown> },
  intent: "preview" | "final"
): AssetArtifact[] {
  const artifacts: AssetArtifact[] = [
    {
      id: intent === "preview" ? "preview-glb" : "final-glb",
      label: intent === "preview" ? "Preview GLB" : "Final GLB",
      kind: intent === "preview" ? "preview" : "final",
      format: "glb",
      mimeType: "model/gltf-binary",
      status: "ready",
      url: result.glbUrl,
      fileName: intent === "preview" ? "preview.glb" : "final.glb"
    },
    {
      id: "handoff-report",
      label: "Handoff Report",
      kind: "report",
      format: "json",
      mimeType: "application/json",
      status: "ready",
      inlineJson: {
        provider: result.provider,
        objectName: brief.objectName,
        destination: brief.destination,
        constraints: brief.constraints,
        exportTargets: brief.exportTargets
      },
      fileName: "handoff-report.json"
    }
  ];

  const meta = result.meta as Record<string, unknown>;
  const objUrl = typeof meta.objUrl === "string" ? meta.objUrl : null;
  const zipUrl = typeof meta.zipUrl === "string" ? meta.zipUrl : null;
  const textureUrl = typeof meta.textureZipUrl === "string" ? meta.textureZipUrl : null;

  if (objUrl) {
    artifacts.push({
      id: "mesh-obj",
      label: "OBJ Export",
      kind: "export",
      format: "obj",
      mimeType: "model/obj",
      status: "ready",
      url: objUrl,
      fileName: "final.obj"
    });
  }

  if (textureUrl) {
    artifacts.push({
      id: "mesh-textures",
      label: "Textures ZIP",
      kind: "export",
      format: "zip",
      mimeType: "application/zip",
      status: "ready",
      url: textureUrl,
      fileName: "textures.zip"
    });
  }

  if (zipUrl) {
    artifacts.push({
      id: "blend-pack",
      label: "Blend Pack",
      kind: "export",
      format: "zip",
      mimeType: "application/zip",
      status: "ready",
      url: zipUrl,
      fileName: "blend-pack.zip"
    });
  }

  return artifacts.map((artifact) => withArtifactUrls(jobId, artifact));
}

function meshValidation(brief: AssetBrief, meta: Record<string, unknown>) {
  const warnings: AssetValidationCheck[] = [
    {
      label: "Triangle budget",
      status: "planned",
      detail: "Provider metadata does not yet expose triangle counts."
    },
    {
      label: "Bounding box and unit guess",
      status: "planned"
    },
    {
      label: "UV presence",
      status: brief.qualityTargets.texture === "none" ? "planned" : "needs-work"
    },
    {
      label: "Pivot and origin sanity",
      status: "planned"
    }
  ];

  if (typeof meta.thumbnailUrl === "string") {
    warnings.unshift({
      label: "Preview render",
      status: "ready"
    });
  }

  return warnings;
}

function normalizeValidation(checks: AssetValidationCheck[]) {
  return checks;
}

async function finalizeUsage(input: {
  body: ParsedBody;
  traceId: string;
  userId: string | null;
  provider: string;
  latencyMs: number;
  success: boolean;
  lane: "mesh" | "cad";
  errorCode?: string;
}) {
  await recordUsage({
    userId: input.userId,
    sessionId: input.body.sessionId,
    traceId: input.traceId,
    stage: input.lane === "cad" ? "cad" : "generate3d",
    provider: input.provider,
    latencyMs: input.latencyMs,
    success: input.success,
    errorCode: input.errorCode ?? null,
    metadata: { intent: input.body.intent, lane: input.lane }
  });
}

function jsonError(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
