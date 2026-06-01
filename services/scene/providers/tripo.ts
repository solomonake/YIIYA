/**
 * Tripo AI provider — fast text/image → 3D.
 *
 * Console:  https://platform.tripo3d.ai/
 * Docs:     https://platform.tripo3d.ai/docs
 * API base: https://api.tripo3d.ai/v2/openapi
 *
 * Pricing (verify before launch): per-task credit; the free tier currently
 * grants ~200 credits / month.
 *
 * Why this provider exists:
 *   - Tripo's text-to-3D is the fastest in the open market (~8s median).
 *   - Used as the "preview" tier in the router cascade for text inputs.
 *   - Returns a GLB URL on a CDN we can stream straight to the browser.
 */
import type { GenerationRequest, GenerationResult, ProviderClient } from "./types";

const BASE = process.env.TRIPO_API_URL ?? "https://api.tripo3d.ai/v2/openapi";
const KEY = process.env.TRIPO_API_KEY;

type TaskResponse = {
  code: number;
  data: { task_id: string };
};

type TaskStatus = {
  code: number;
  data: {
    task_id: string;
    status: "queued" | "running" | "success" | "failed" | "banned" | "cancelled";
    progress?: number;
    output?: { pbr_model?: string; model?: string; rendered_image?: string };
    error?: { message?: string };
  };
};

export const tripo: ProviderClient = {
  name: "tripo",

  supports(kind) {
    return kind === "text-to-3d" || kind === "image-to-3d";
  },

  async generate(request, signal): Promise<GenerationResult> {
    if (!KEY) throw new Error("TRIPO_API_KEY not configured");
    const started = Date.now();

    const body =
      request.kind === "text-to-3d"
        ? {
            type: "text_to_model",
            prompt: request.prompt ?? "",
            model_version: "v2.5-20250123",
            texture: true,
            pbr: request.pbr ?? true,
            seed: request.seed
          }
        : {
            type: "image_to_model",
            file: {
              type: "url",
              url: request.imageUrl
            },
            model_version: "v2.5-20250123",
            texture: true,
            pbr: request.pbr ?? true,
            seed: request.seed
          };

    const createRes = await fetch(`${BASE}/task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal
    });
    if (!createRes.ok) {
      throw new Error(`tripo task create failed: ${createRes.status} ${await createRes.text()}`);
    }
    const created = (await createRes.json()) as TaskResponse;
    if (created.code !== 0 || !created.data?.task_id) {
      throw new Error(`tripo bad task response: ${JSON.stringify(created)}`);
    }

    const taskId = created.data.task_id;
    const pollInterval = 2_000;
    const deadline = started + (request.budgetMs ?? 60_000);

    while (Date.now() < deadline) {
      if (signal.aborted) throw new Error("aborted");
      await sleep(pollInterval);
      const statusRes = await fetch(`${BASE}/task/${taskId}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        signal
      });
      if (!statusRes.ok) continue;
      const status = (await statusRes.json()) as TaskStatus;
      const data = status.data;
      if (!data) continue;
      if (data.status === "success") {
        const glb = data.output?.pbr_model ?? data.output?.model;
        if (!glb) throw new Error("tripo finished but returned no model");
        return {
          provider: "tripo",
          glbUrl: glb,
          thumbnailUrl: data.output?.rendered_image,
          latencyMs: Date.now() - started,
          cost: { provider: "tripo", usd: 0.05 },
          meta: { task_id: taskId }
        };
      }
      if (data.status === "failed" || data.status === "banned" || data.status === "cancelled") {
        throw new Error(`tripo task ${data.status}: ${data.error?.message ?? "unknown"}`);
      }
    }
    throw new Error("tripo task timed out");
  }
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
