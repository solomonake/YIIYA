/**
 * Meshy text-to-texture (retexture) — Phase 11.
 *
 * Restyles the ACTIVE mesh ("make it look more human") by regenerating only
 * its textures: same geometry, new skin. Fills the middle tier between the
 * instant client-side material fast path (lib/scene/local-edit.ts) and a
 * full mesh re-roll through the provider cascade.
 *
 * API contract verified against docs.meshy.ai on 2026-07-12:
 *   POST https://api.meshy.ai/openapi/v1/retexture
 *     Authorization: Bearer <MESHY_API_KEY>
 *     { model_url, text_style_prompt, enable_original_uv, enable_pbr,
 *       ai_model, target_formats } → { result: "<task_id>" }
 *     model_url accepts a publicly accessible URL (.glb/.gltf/.obj/.fbx/.stl);
 *     text_style_prompt is capped at 600 characters.
 *   GET https://api.meshy.ai/openapi/v1/retexture/:id
 *     → { status: "PENDING"|"IN_PROGRESS"|"SUCCEEDED"|"FAILED"|"CANCELED",
 *         model_urls: { glb, ... }, texture_urls: [{ base_color, metallic,
 *         normal, roughness, ... }], consumed_credits, task_error }
 */
import { isAllowedProviderUrl } from "@/lib/provider-hosts";

export const MESHY_RETEXTURE_ENDPOINT = "https://api.meshy.ai/openapi/v1/retexture";

/** Meshy rejects text_style_prompt longer than 600 characters. */
export const MESHY_STYLE_PROMPT_MAX = 600;

const RETEXTURABLE_EXTENSIONS = /\.(glb|gltf|obj|fbx|stl)$/i;

export type RetexturePayload = {
  model_url: string;
  text_style_prompt: string;
  /** false = let Meshy re-unwrap UVs (robust for provider meshes with auto UVs). Geometry is unchanged either way. */
  enable_original_uv: boolean;
  enable_pbr: boolean;
  ai_model: "latest";
  target_formats: ["glb"];
};

export type RetextureTextureUrls = {
  albedo?: string;
  normal?: string;
  roughness?: string;
  metalness?: string;
};

export type RetextureResult = {
  url: string | null;
  /** Actual credits Meshy reports for the task — surfaced in the user log. */
  consumedCredits: number | null;
  textureUrls?: RetextureTextureUrls;
  /** True once a task was created (credits may have been spent even on failure). */
  taskCreated: boolean;
  error: string | null;
};

/**
 * A mesh URL Meshy can retexture: public https on a host we already trust
 * (our Blob mirror or a provider CDN) with a format Meshy accepts. Rejects
 * relative proxy URLs (`/api/3d/proxy?...`), data URIs, and anything off the
 * allowlist — the URL is client-supplied, so this doubles as the SSRF guard
 * before we hand it to a third party.
 */
export function canRetextureModelUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string" || !isAllowedProviderUrl(url)) return false;
  try {
    return RETEXTURABLE_EXTENSIONS.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Collapse whitespace and enforce Meshy's 600-char style prompt cap. */
export function buildRetexturePayload(modelUrl: string, stylePrompt: string): RetexturePayload {
  return {
    model_url: modelUrl,
    text_style_prompt: stylePrompt.replace(/\s+/g, " ").trim().slice(0, MESHY_STYLE_PROMPT_MAX),
    enable_original_uv: false,
    enable_pbr: true,
    ai_model: "latest",
    target_formats: ["glb"]
  };
}

/**
 * Map Meshy's texture_urls entry onto the GeneratedAsset textureUrls shape
 * (Meshy says base_color/metallic; we say albedo/metalness).
 */
export function mapMeshyTextureUrls(
  textureUrls: Array<Record<string, unknown>> | null | undefined
): RetextureTextureUrls | undefined {
  const first = textureUrls?.[0];
  if (!first) return undefined;
  const pick = (key: string) => (typeof first[key] === "string" ? (first[key] as string) : undefined);
  const mapped: RetextureTextureUrls = {
    albedo: pick("base_color"),
    normal: pick("normal"),
    roughness: pick("roughness"),
    metalness: pick("metallic")
  };
  return Object.values(mapped).some(Boolean) ? mapped : undefined;
}

/**
 * Cache key for the route's prompt→asset cache. Edit phrases only mean
 * something relative to the mesh they edited — "make it look more human"
 * cached bare would be wrongly served for a *different* asset later. The
 * source-mesh hash scopes the hit to the same phrase on the same mesh.
 */
export function retextureCacheKey(prompt: string, modelUrl: string): string {
  return `${prompt.trim()} [retexture:${hashString(modelUrl)}]`;
}

/** djb2 — tiny, deterministic, collision-tolerant enough for a cache-key suffix. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a retexture task and poll it to completion. Same create-then-poll
 * shape as generateViaMeshy in lib/interpret-pipeline.ts, but returns the
 * consumed credit count so the pipeline can log the true cost.
 */
export async function retextureViaMeshy(
  modelUrl: string,
  stylePrompt: string,
  opts?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<RetextureResult> {
  const fail = (error: string, taskCreated = false): RetextureResult => ({
    url: null,
    consumedCredits: null,
    taskCreated,
    error
  });

  const key = process.env.MESHY_API_KEY;
  if (!key) return fail("MESHY_API_KEY not set");

  try {
    const createRes = await fetch(MESHY_RETEXTURE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRetexturePayload(modelUrl, stylePrompt)),
      signal: AbortSignal.timeout(20_000)
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => "");
      return fail(`meshy retexture create ${createRes.status}${detail ? ` — ${detail.slice(0, 120)}` : ""}`);
    }
    const created = (await createRes.json()) as { result?: string };
    const taskId = created?.result;
    if (!taskId) return fail("meshy retexture returned no task id");

    const deadline = Date.now() + (opts?.timeoutMs ?? 210_000);
    while (Date.now() < deadline) {
      await sleep(opts?.pollIntervalMs ?? 4000);
      const statusRes = await fetch(`${MESHY_RETEXTURE_ENDPOINT}/${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);
      if (!statusRes || !statusRes.ok) continue;
      const d = (await statusRes.json()) as {
        status?: string;
        model_urls?: { glb?: string };
        texture_urls?: Array<Record<string, unknown>>;
        consumed_credits?: number;
        task_error?: { message?: string } | null;
      };
      if (d?.status === "SUCCEEDED") {
        const glb = d.model_urls?.glb;
        if (!glb) return fail("meshy retexture succeeded but returned no glb", true);
        return {
          url: glb,
          consumedCredits: typeof d.consumed_credits === "number" ? d.consumed_credits : null,
          textureUrls: mapMeshyTextureUrls(d.texture_urls),
          taskCreated: true,
          error: null
        };
      }
      if (d?.status === "FAILED" || d?.status === "CANCELED") {
        const reason = d.task_error?.message ? ` — ${d.task_error.message.slice(0, 120)}` : "";
        return fail(`meshy retexture ${d.status}${reason}`, true);
      }
    }
    return fail("meshy retexture timed out", true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RETEXTURE]", msg);
    return fail(msg.slice(0, 200));
  }
}
