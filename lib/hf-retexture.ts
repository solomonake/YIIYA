/**
 * Restyle an existing mesh on Hugging Face — same geometry, new textures.
 *
 * Replaces the closed Meshy retexture path (PR #14) with the free
 * HorizonRobotics/EmbodiedGen-Texture-Gen Space (Apache-2.0, ZeroGPU). The
 * Space's API was read from its public gradio_api/info on 2026-10-11:
 *
 *   /start_session                       → per-client session dir
 *   /generate_condition(mesh_path)       → geometry condition renders
 *   /generate_texture_mvimages(prompt…)  → 3 multi-view texture samples
 *   /get_selected_image(choice, s1..s3)  → the chosen sample
 *   /backproject_texture_v2(mesh_path, input_image, texture_size,
 *                           enable_delight, fix_mesh)
 *                                         → [textured mesh, log, download]
 *
 * `fix_mesh` ("simplify mesh") is always false so the geometry is kept.
 * A token does not guarantee the Space is up or that quota remains; callers
 * must treat every failure as "nothing changed" and never fall back to a
 * full regeneration on their own.
 */
import { Client } from "@gradio/client";
import { isAllowedProviderUrl, providerAuthHeaders } from "@/lib/provider-hosts";

export const RETEXTURE_SPACE = "HorizonRobotics/EmbodiedGen-Texture-Gen";

/** Keep prompts short and plain; the Space accepts English or Chinese. */
export const RETEXTURE_PROMPT_MAX = 300;

/** Hard cap on the source mesh we upload to the Space. */
export const RETEXTURE_MAX_BYTES = 60 * 1024 * 1024;

const MESH_EXTENSIONS = /\.(glb|obj)$/i;
const PROXY_PREFIX = "/api/3d/proxy?";

export type RetextureResult = {
  url: string | null;
  /** True once the Space accepted work (GPU quota may have been used even on failure). */
  started: boolean;
  error: string | null;
};

/**
 * Resolve the active asset's GLB URL to something the server may fetch.
 * Accepts allowlisted https URLs (Blob mirror, provider CDNs) and our own
 * `/api/3d/proxy?src=<allowlisted>` form. Anything else — data URIs,
 * arbitrary hosts, placeholders — returns null. The URL is client-supplied,
 * so this is also the SSRF guard.
 */
export function resolveSourceMeshUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw) return null;
  let candidate = raw;
  if (raw.startsWith(PROXY_PREFIX)) {
    const src = new URLSearchParams(raw.slice(PROXY_PREFIX.length)).get("src");
    if (!src) return null;
    candidate = src;
  }
  if (!isAllowedProviderUrl(candidate)) return null;
  try {
    const path = new URL(candidate).pathname;
    // HF Space file URLs (…/gradio_api/file=/tmp/…/mesh.glb) keep the extension in the path.
    return MESH_EXTENSIONS.test(path) ? candidate : null;
  } catch {
    return null;
  }
}

/** Collapse whitespace, drop the edit opener, and cap length. */
export function buildRetexturePrompt(transcript: string, objectName?: string): string {
  const style = transcript
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(please\s+)?(make|turn|give|render|paint|restyle|retexture)\s+(it|this|that)\s+/i, "")
    .replace(/[.!?]+$/, "");
  const base = objectName ? `${objectName}, ${style}` : style;
  return base.slice(0, RETEXTURE_PROMPT_MAX);
}

/**
 * Cache key for the route's prompt→asset cache. "Make it walnut" only means
 * something relative to the mesh it restyled, so the key is scoped to it.
 */
export function retextureCacheKey(prompt: string, modelUrl: string): string {
  return `${prompt.trim()} [retexture:${hashString(modelUrl)}]`;
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Triangle count and size must stay close for "geometry kept" to be claimed. */
export function geometryKept(
  before: { triangles?: number; maxDimension?: number },
  after: { triangles?: number; maxDimension?: number }
): boolean | null {
  if (!before.triangles || !after.triangles) return null;
  const triDelta = Math.abs(after.triangles - before.triangles) / before.triangles;
  if (triDelta > 0.1) return false;
  if (before.maxDimension && after.maxDimension) {
    const dimDelta = Math.abs(after.maxDimension - before.maxDimension) / before.maxDimension;
    if (dimDelta > 0.05) return false;
  }
  return true;
}

/** Find a mesh file URL in a gradio result (Model3d / DownloadButton / FileData). */
export function extractMeshUrl(data: unknown): string | null {
  const items: unknown[] = Array.isArray(data) ? data : [data];
  for (const item of items) {
    if (typeof item === "string" && /\.(glb|obj)(\?|$)/i.test(item)) return item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      for (const key of ["url", "path", "value"]) {
        const v = rec[key];
        if (typeof v === "string" && /\.(glb|obj)(\?|$)/i.test(v)) return v;
      }
    }
  }
  return null;
}

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    const known = rec.message ?? rec.detail ?? rec.error ?? rec.title;
    if (typeof known === "string" && known) return known;
    try {
      return JSON.stringify(err).slice(0, 200);
    } catch {
      return "provider error";
    }
  }
  return String(err);
}

type GradioClient = {
  predict: (endpoint: string, payload: Record<string, unknown>) => Promise<{ data: unknown }>;
};

export type RetextureDeps = {
  connect?: (space: string, token: string) => Promise<GradioClient>;
  fetchMesh?: (url: string) => Promise<Blob | null>;
};

async function defaultFetchMesh(url: string): Promise<Blob | null> {
  const res = await fetch(url, { headers: providerAuthHeaders(url), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) return null;
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > RETEXTURE_MAX_BYTES) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > RETEXTURE_MAX_BYTES) return null;
  const isObj = /\.obj(\?|$)/i.test(url);
  // Upload as a *named* file: the Space picks its mesh loader from the
  // extension, and an unnamed Blob arrives without one (smoke test 2026-10-11).
  return new File([buf], isObj ? "mesh.obj" : "mesh.glb", { type: isObj ? "model/obj" : "model/gltf-binary" });
}

/**
 * Run the five-step EmbodiedGen texture flow on one gradio session.
 * Returns the textured mesh URL, or an error with `started` telling the
 * caller whether GPU work may already have been spent.
 */
export async function retextureViaHuggingFace(
  sourceUrl: string,
  prompt: string,
  opts: { token?: string; textureSize?: 1024 | 2048; seed?: number } = {},
  deps: RetextureDeps = {}
): Promise<RetextureResult> {
  const fail = (error: string, started = false): RetextureResult => ({ url: null, started, error });

  const token = opts.token || process.env.HUGGINGFACE_TOKEN;
  if (!token) return fail("Hugging Face token not configured");

  const mesh = await (deps.fetchMesh ?? defaultFetchMesh)(sourceUrl).catch(() => null);
  if (!mesh) return fail("Couldn't read the current mesh (missing, too large, or expired)");

  let started = false;
  try {
    const client = deps.connect
      ? await deps.connect(RETEXTURE_SPACE, token)
      : ((await Client.connect(RETEXTURE_SPACE, { hf_token: token as `hf_${string}` })) as unknown as GradioClient);

    await client.predict("/start_session", {});
    started = true;
    await client.predict("/generate_condition", { mesh_path: mesh });

    const samples = await client.predict("/generate_texture_mvimages", {
      prompt,
      controlnet_cond_scale: 0.7,
      guidance_scale: 9,
      strength: 0.9,
      num_inference_steps: 50,
      seed: opts.seed ?? 0,
      ip_adapt_scale: 0.7,
      ip_img_path: null
    });
    const [s1, s2, s3] = Array.isArray(samples.data) ? samples.data : [];
    if (!s1) return fail("Texture step returned no images", true);

    const chosen = await client.predict("/get_selected_image", {
      choice: "sample1",
      sample1: s1,
      sample2: s2 ?? s1,
      sample3: s3 ?? s1
    });
    const image = Array.isArray(chosen.data) ? chosen.data[0] : chosen.data;
    if (!image) return fail("No texture image was selected", true);

    const result = await client.predict("/backproject_texture_v2", {
      mesh_path: mesh,
      input_image: image,
      texture_size: opts.textureSize ?? 2048,
      enable_delight: true,
      fix_mesh: false // never simplify: the whole point is keeping the geometry
    });
    const url = extractMeshUrl(result.data);
    if (!url) return fail("The Space returned no textured mesh", true);
    if (!/\.glb(\?|$)/i.test(url)) return fail("The Space returned a non-GLB mesh", true);
    return { url, started: true, error: null };
  } catch (err) {
    const msg = message(err);
    console.error("[RETEXTURE]", msg);
    return fail(msg.slice(0, 200), started);
  }
}
