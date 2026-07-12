/**
 * YIIYA — Pure 3D Spatial Pipeline
 * 5 agents: Director → Reference Grounder → Spatial Generator → Material Artist → Packager
 */
import { Client } from "@gradio/client";
import { mirrorGlbToBlob } from "@/lib/vercel-blob";
import { classifyPromptSubject, objectGenerationPrompt } from "@/lib/scene/prompt-intent";
import { isAllowedProviderUrl, providerAuthHeaders } from "@/lib/provider-hosts";
import { canRetextureModelUrl, retextureViaMeshy } from "@/lib/meshy-retexture";
import { buildExportUrls } from "@/lib/scene/export-urls";
import type { MaterialOverride } from "@/lib/scene/local-edit";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThreeDIntentType =
  | "single_object"
  | "multi_object_scene"
  | "material_edit"
  | "variant_set"
  | "pose_variation";

export type PBRMaterialBrief = {
  baseColor: string;
  metalness: number;
  roughness: number;
  emissive?: string;
  transmission?: number;
  textureStyle: string;
};

export type ThreeDObjectSlot = {
  name: string;
  description: string;
  relativeScale: number;
  position?: [number, number, number];
  materialBrief: PBRMaterialBrief;
};

export type ThreeDBrief = {
  intent: ThreeDIntentType;
  primaryObject: string;
  description: string;
  useCase: "hero_asset" | "environment_prop" | "character_accessory" | "modular_kit" | "concept";
  polygonBudget: "high" | "mid" | "low";
  targetPlatform: "unreal" | "unity" | "blender" | "print" | "general";
  styleTags: string[];
  materialBrief: PBRMaterialBrief;
  needsLODChain: boolean;
  needsPhysicsMetadata: boolean;
  priorityFormat: "glb" | "fbx" | "usd" | "obj";
  sceneSlots?: ThreeDObjectSlot[];
  confidence: number;
  /** Short follow-up prompts a user can tap to refine this generation (material, style, or detail changes). */
  suggestions?: string[];
  /** Set only when the prompt was too vague to resolve confidently (e.g. "make something cool"). */
  clarifyingQuestion?: string;
};

export type StyleDNA = {
  polyDensity: "lowpoly" | "midpoly" | "highpoly" | "stylized";
  edgeHardness: "hard" | "soft" | "mixed";
  textureResolution: 512 | 1024 | 2048 | 4096;
  shadingModel: "pbr" | "toon" | "unlit";
  styleLabel: string;
  colorPalette: string[];
};

export type ReferenceGroundingResult = {
  referenceImages: string[];
  materialBrief: PBRMaterialBrief;
  proportions?: { widthToHeight: number; depthToHeight: number };
  analysisNotes: string;
};

export type GeneratedAsset = {
  id: string;
  /** Supabase `assets.id` once saved for a signed-in user; undefined for anonymous or unsaved generations. */
  dbId?: string;
  name: string;
  glbUrl: string;
  tier: "library" | "hunyuan3d" | "trellis" | "fallback";
  triangleCount?: number;
  materialBrief: PBRMaterialBrief;
  textureUrls?: {
    albedo?: string;
    normal?: string;
    roughness?: string;
    metalness?: string;
    ao?: string;
  };
  exportUrls: Partial<Record<"glb" | "obj" | "usd" | "fbx" | "stl", string>>;
  scaleMeters: number;
  isWatertight?: boolean;
  /**
   * Client-side material/scale tweaks applied on top of the generated GLB
   * (color, finish, glow, scale). Kept off the mesh itself so they're free,
   * instant, and reversible — see lib/scene/local-edit.ts.
   */
  materialOverride?: MaterialOverride;
  /**
   * Set when this asset is a Meshy retexture of an existing mesh — the URL of
   * the GLB whose geometry it preserves. Used to scope the prompt cache to
   * the source mesh (lib/meshy-retexture.ts retextureCacheKey).
   */
  sourceGlbUrl?: string;
};

export type ReferenceImageInput = {
  base64: string;
  mediaType: string;
  name: string;
  /**
   * Extra segmented views of the same object from a video walk-around
   * (lib/vision/video-frames.ts), ordered [left, back]. When both are present
   * the multi-view provider (Hunyuan3D multi-view on fal) runs first for
   * genuinely better geometry; otherwise the single-image cascade is used.
   */
  additionalViews?: Array<{ base64: string; mediaType: string }>;
};

export type InterpretRequestBody = {
  transcript: string;
  referenceImage?: ReferenceImageInput | null;
  sessionStyleDNA?: StyleDNA | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  existingAssets?: Array<{ id: string; name: string }>;
  /** BYO HuggingFace token from Settings — unlocks the user's own free ZeroGPU quota instead of the shared server one. */
  userHfToken?: string;
  /** Skip the ambiguity gate — set when the user answered (or dismissed) a clarify prompt. */
  forceGenerate?: boolean;
  /**
   * Public GLB URL of the asset currently active in the viewport (Blob mirror
   * or provider CDN). When the Director classifies the phrase as a
   * material_edit, this unlocks the Meshy retexture fast path: same geometry,
   * new textures, instead of re-rolling the whole mesh.
   */
  activeAssetGlbUrl?: string;
};

export type PipelineEvent =
  | { type: "director"; brief: ThreeDBrief; log: string }
  | { type: "grounding"; result: ReferenceGroundingResult; log: string }
  | { type: "clarify"; question: string; options: string[]; previewImage: string | null; brief: ThreeDBrief; log: string }
  | { type: "style_dna"; dna: StyleDNA; log: string }
  | { type: "generating"; log: string; progress?: number }
  | { type: "asset_ready"; asset: GeneratedAsset; log: string }
  | { type: "qa"; qa_log: string[] }
  | { type: "done"; assets: GeneratedAsset[]; brief: ThreeDBrief; qa_log: string[] }
  | { type: "error"; message: string };

export function isInterpretRequest(value: unknown): value is InterpretRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.transcript === "string";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.includes("your_")) throw new Error(`Missing env var: ${name}`);
  return val;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

/**
 * Human-readable message from any thrown value. The gradio client rejects
 * with plain objects; String(obj) renders "[object Object]" which is what
 * users used to see in the generator log.
 */
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (isRecord(err)) {
    const known = err.message ?? err.detail ?? err.error ?? err.title;
    if (typeof known === "string" && known) return known;
    try {
      return JSON.stringify(err).slice(0, 200);
    } catch {
      return "provider error (unserializable)";
    }
  }
  return String(err);
}

function parseJsonFromText(text: string): unknown {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) ?? t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m?.[1]) return JSON.parse(m[1].trim());
  throw new Error("Model response was not valid JSON");
}

async function callGemini(
  system: string,
  userMessage: string,
  model = "gemini-2.5-flash",
  imageBase64?: string,
  imageMime?: string
): Promise<string> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const parts: unknown[] = [];
  if (imageBase64 && imageMime) {
    parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
  }
  parts.push({ text: userMessage });

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2000, responseMimeType: "application/json" }
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  };
  return data.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("").trim() ?? "";
}

function safeMaterial(raw: unknown): PBRMaterialBrief {
  const r = isRecord(raw) ? raw : {};
  return {
    baseColor: typeof r.baseColor === "string" ? r.baseColor : "#808080",
    metalness: typeof r.metalness === "number" ? r.metalness : 0,
    roughness: typeof r.roughness === "number" ? r.roughness : 0.7,
    emissive: typeof r.emissive === "string" ? r.emissive : undefined,
    transmission: typeof r.transmission === "number" ? r.transmission : undefined,
    textureStyle: typeof r.textureStyle === "string" ? r.textureStyle : "pbr-realistic"
  };
}

// ─── Agent 1 — 3D Intent Director ─────────────────────────────────────────────

const DIRECTOR_SYSTEM = `You are a senior 3D art director at a AAA game studio.
The user describes a 3D asset or scene. Produce a structured JSON brief for the generation pipeline.

Return ONLY valid JSON:
{
  "intent": "single_object" | "multi_object_scene" | "material_edit" | "variant_set" | "pose_variation",
  "primaryObject": string,
  "description": string,
  "useCase": "hero_asset" | "environment_prop" | "character_accessory" | "modular_kit" | "concept",
  "polygonBudget": "high" | "mid" | "low",
  "targetPlatform": "unreal" | "unity" | "blender" | "print" | "general",
  "styleTags": string[],
  "materialBrief": { "baseColor": string, "metalness": number, "roughness": number, "textureStyle": string },
  "needsLODChain": boolean,
  "needsPhysicsMetadata": boolean,
  "priorityFormat": "glb" | "fbx" | "usd" | "obj",
  "sceneSlots": [],
  "confidence": number,
  "suggestions": string[],
  "clarifyingQuestion": string | null
}

Rules:
- Interpret ordinary noun prompts as physical objects. If the user says "a car",
  primaryObject must be the car object, not the words "a car".
- Only create typography/letterform assets when the user explicitly asks for
  text, words, letters, a phrase, typography, signage, or a wordmark.
- For non-typographic object prompts, description must include "no text, no
  letters, no typography".
- hero_asset=high poly, environment_prop=mid poly, character_accessory=high poly
- Unreal/UE5 -> targetPlatform=unreal, priorityFormat=fbx, needsLODChain=true
- Unity -> targetPlatform=unity, priorityFormat=glb
- Blender -> targetPlatform=blender, priorityFormat=glb
- 3d print -> targetPlatform=print, priorityFormat=obj
- Populate sceneSlots only for multi_object_scene intent
- suggestions: exactly 3 short follow-up prompts (3-6 words each) the user
  could tap next to refine THIS object — one about material/finish, one about
  style, one about a physical detail. Write them as standalone commands, e.g.
  "make it rusted metal", "make it lowpoly", "add a cracked lid". Never
  suggest changing the subject entirely.
- clarifyingQuestion: null unless the prompt is too vague to resolve into a
  concrete object (e.g. "make something cool", "surprise me"). When set, keep
  it to one short question and still fill in your best-guess primaryObject so
  the pipeline has something to try.`;

async function runDirector(body: InterpretRequestBody): Promise<ThreeDBrief> {
  const promptIntent = classifyPromptSubject(body.transcript);
  const ctx = JSON.stringify({
    userPrompt: promptIntent.generationPrompt,
    rawUserPrompt: body.transcript,
    promptKind: promptIntent.kind,
    promptSubject: promptIntent.subject,
    hasReferenceImage: Boolean(body.referenceImage),
    sessionStyle: body.sessionStyleDNA?.styleLabel ?? null,
    existingAssets: body.existingAssets ?? [],
    history: body.history?.slice(-3) ?? []
  });

  const text = await callGemini(DIRECTOR_SYSTEM, ctx);
  const parsed = parseJsonFromText(text);
  if (!isRecord(parsed)) throw new Error("Director returned invalid brief");

  const intent = (parsed.intent as ThreeDIntentType) ?? "single_object";
  const primaryObject = promptIntent.kind === "object"
    ? promptIntent.subject
    : String(parsed.primaryObject ?? promptIntent.subject ?? "typography");
  const description = String(parsed.description ?? promptIntent.generationPrompt);
  return {
    intent,
    primaryObject,
    description: promptIntent.kind === "object" && !/\bno\s+(?:text|letters|typography)\b/i.test(description)
      ? `${description}. No text, no letters, no typography.`
      : description,
    useCase: (parsed.useCase as ThreeDBrief["useCase"]) ?? "concept",
    polygonBudget: (parsed.polygonBudget as "high" | "mid" | "low") ?? "mid",
    targetPlatform: (parsed.targetPlatform as ThreeDBrief["targetPlatform"]) ?? "general",
    styleTags: Array.isArray(parsed.styleTags)
      ? parsed.styleTags.filter((s): s is string => typeof s === "string")
      : [],
    materialBrief: safeMaterial(parsed.materialBrief),
    needsLODChain: Boolean(parsed.needsLODChain),
    needsPhysicsMetadata: Boolean(parsed.needsPhysicsMetadata),
    priorityFormat: (parsed.priorityFormat as ThreeDBrief["priorityFormat"]) ?? "glb",
    sceneSlots: Array.isArray(parsed.sceneSlots) && intent === "multi_object_scene"
      ? (parsed.sceneSlots as unknown[]).filter(isRecord).map(slot => ({
          name: String(slot.name ?? "object"),
          description: String(slot.description ?? ""),
          relativeScale: Number(slot.relativeScale ?? 1),
          materialBrief: safeMaterial(slot.materialBrief)
        }))
      : undefined,
    confidence: Number(parsed.confidence ?? 0.8),
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === "string").slice(0, 3)
      : undefined,
    clarifyingQuestion: typeof parsed.clarifyingQuestion === "string" ? parsed.clarifyingQuestion : undefined
  };
}

/**
 * Deterministic Director fallback. When Gemini is unreachable (no key, rate
 * limit, outage) the pipeline used to die before doing any work. The local
 * prompt classifier already understands object-vs-typography intent, so we
 * can still build a usable brief and let the provider cascade run.
 */
function localDirectorBrief(body: InterpretRequestBody): ThreeDBrief {
  const promptIntent = classifyPromptSubject(body.transcript);
  const description =
    promptIntent.kind === "object"
      ? `${promptIntent.generationPrompt}. No text, no letters, no typography.`
      : promptIntent.generationPrompt;
  return {
    intent: "single_object",
    primaryObject: promptIntent.subject,
    description,
    useCase: "concept",
    polygonBudget: "mid",
    targetPlatform: "general",
    styleTags: [],
    materialBrief: safeMaterial(null),
    needsLODChain: false,
    needsPhysicsMetadata: false,
    priorityFormat: "glb",
    confidence: 0.5
  };
}

// ─── Agent 2a — Photo Analyst ─────────────────────────────────────────────────

const PHOTO_ANALYST_SYSTEM = `You are a technical 3D scanning specialist.
Analyze the reference image for 3D reconstruction. Return ONLY valid JSON:
{
  "primaryObject": string,
  "proportions": { "widthToHeight": number, "depthToHeight": number },
  "materialBrief": { "baseColor": string, "metalness": number, "roughness": number, "textureStyle": string },
  "analysisNotes": string
}`;

async function runPhotoAnalyst(image: ReferenceImageInput): Promise<{
  primaryObject: string;
  proportions?: { widthToHeight: number; depthToHeight: number };
  materialBrief: PBRMaterialBrief;
  analysisNotes: string;
}> {
  try {
    const text = await callGemini(
      PHOTO_ANALYST_SYSTEM,
      "Analyze this reference image for 3D reconstruction.",
      "gemini-2.5-flash",
      image.base64,
      image.mediaType
    );
    const parsed = parseJsonFromText(text);
    if (!isRecord(parsed)) throw new Error("bad");
    return {
      primaryObject: String(parsed.primaryObject ?? "object"),
      proportions: isRecord(parsed.proportions) ? {
        widthToHeight: Number(parsed.proportions.widthToHeight ?? 1),
        depthToHeight: Number(parsed.proportions.depthToHeight ?? 1)
      } : undefined,
      materialBrief: safeMaterial(parsed.materialBrief),
      analysisNotes: String(parsed.analysisNotes ?? "Photo analyzed")
    };
  } catch {
    return {
      primaryObject: "object",
      materialBrief: safeMaterial(null),
      analysisNotes: "Photo analysis skipped, using defaults"
    };
  }
}

// ─── Agent 2b — Studio Photo Grounding (Pollinations.ai, free) ────────────────
//
// Image-to-3D models (TRELLIS, Hunyuan3D, InstantMesh) are trained on clean,
// centered, well-lit single-object photos — not orthographic technical views.
// Feeding 4 ortho views to a single-image generator was wasted bandwidth and
// usually produced confused output. We now synthesize ONE clean studio photo
// and let the generator's own multi-view diffusion handle the geometry.

function pollinationsUrl(prompt: string, w = 768, h = 768): string {
  const seed = Math.floor(Math.random() * 99999);
  // `enhance=true` runs a slow server-side LLM prompt-rewrite (5–15s) and was a
  // major source of pre-generation latency. Dropped. `model=turbo` is the fast
  // path; the prompt we send is already studio-specific so we don't need rewrite.
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=turbo&seed=${seed}`;
}

// Fire a request at an image URL without awaiting it, so it is generated/cached
// by the time a 3D provider fetches it. Never throws.
function prewarmImage(url: string): void {
  void fetch(url, { method: "GET", signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
}

async function runStudioPhotoGrounding(brief: ThreeDBrief): Promise<ReferenceGroundingResult> {
  const obj = objectGenerationPrompt(brief.primaryObject);
  const style = brief.styleTags.join(", ") || "realistic";
  const mat = brief.materialBrief.textureStyle;
  const prompt = `single isolated ${obj}, ${style}, ${mat}, centered three-quarter view, pure white background, no shadow, studio product photography, eye-level, soft neutral lighting, photorealistic, sharp focus, high detail, no text, no watermark`;

  const url = pollinationsUrl(prompt, 768, 768);
  // Start generating the reference image now so it is cached before the first
  // 3D provider fetches it (cuts perceived latency).
  prewarmImage(url);

  return {
    referenceImages: [url],
    materialBrief: brief.materialBrief,
    analysisNotes: "1 studio reference photo (single-image grounding)"
  };
}

// ─── Agent 2c — Style DNA Encoder ─────────────────────────────────────────────

const STYLE_DNA_SYSTEM = `Encode a 3D art style preference as a structured style DNA.
Return ONLY valid JSON:
{
  "polyDensity": "lowpoly" | "midpoly" | "highpoly" | "stylized",
  "edgeHardness": "hard" | "soft" | "mixed",
  "textureResolution": 512 | 1024 | 2048 | 4096,
  "shadingModel": "pbr" | "toon" | "unlit",
  "styleLabel": string,
  "colorPalette": string[]
}`;

async function runStyleDNAEncoder(styleHint: string): Promise<StyleDNA> {
  try {
    const text = await callGemini(STYLE_DNA_SYSTEM, `Style preference: "${styleHint}"`);
    const parsed = parseJsonFromText(text);
    if (!isRecord(parsed)) throw new Error("bad");
    const res = Number(parsed.textureResolution);
    return {
      polyDensity: (parsed.polyDensity as StyleDNA["polyDensity"]) ?? "midpoly",
      edgeHardness: (parsed.edgeHardness as StyleDNA["edgeHardness"]) ?? "mixed",
      textureResolution: ([512, 1024, 2048, 4096].includes(res) ? res : 2048) as StyleDNA["textureResolution"],
      shadingModel: (parsed.shadingModel as StyleDNA["shadingModel"]) ?? "pbr",
      styleLabel: String(parsed.styleLabel ?? styleHint),
      colorPalette: Array.isArray(parsed.colorPalette)
        ? parsed.colorPalette.filter((c): c is string => typeof c === "string")
        : []
    };
  } catch {
    return { polyDensity: "midpoly", edgeHardness: "mixed", textureResolution: 2048, shadingModel: "pbr", styleLabel: styleHint, colorPalette: [] };
  }
}

// ─── Agent 3 — Spatial Generator ──────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  // Node 20's fetch does not support data: URIs. Decode them directly so
  // user-uploaded images (which arrive as data: URLs through the pipeline)
  // actually reach the generator instead of silently failing.
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)(?:;([^,]+))?,(.+)$/);
    if (!match) return null;
    const mediaType = match[1] || "image/jpeg";
    const encoding = match[2] || "";
    const payload = match[3];
    const base64 = encoding === "base64"
      ? payload
      : Buffer.from(decodeURIComponent(payload), "utf-8").toString("base64");
    return { base64, mediaType };
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return { base64: Buffer.from(buf).toString("base64"), mediaType: res.headers.get("content-type") ?? "image/jpeg" };
  } catch {
    return null;
  }
}

const HUNYUAN3D_SPACE = "tencent/Hunyuan3D-2";
const HUNYUAN3D_URL = "https://tencent-hunyuan3d-2.hf.space/";
const TRELLIS_SPACE = "trellis-community/TRELLIS";
const TRELLIS_URL = "https://trellis-community-trellis.hf.space/";
const TRELLIS2_SPACE = process.env.TRELLIS2_SPACE ?? "microsoft/TRELLIS.2";
const TRELLIS2_URL = "https://microsoft-trellis-2.hf.space/";
const INSTANTMESH_SPACE = "TencentARC/InstantMesh";
const INSTANTMESH_URL = "https://tencentarc-instantmesh.hf.space/";
const STABLE_FAST_3D_SPACE = "stabilityai/stable-fast-3d";
const STABLE_FAST_3D_URL = "https://stabilityai-stable-fast-3d.hf.space/";

function spaceWarmer(url: string) {
  let p: Promise<void> | null = null;
  return () => {
    if (!p) {
      p = fetch(url, { method: "GET", signal: AbortSignal.timeout(8_000) })
        .then(() => undefined)
        .catch(() => undefined);
    }
    return p;
  };
}

const warmupHunyuan3D = spaceWarmer(HUNYUAN3D_URL);
const warmupTrellis = spaceWarmer(TRELLIS_URL);
const warmupTrellis2 = spaceWarmer(TRELLIS2_URL);
const warmupInstantMesh = spaceWarmer(INSTANTMESH_URL);
const warmupStableFast3D = spaceWarmer(STABLE_FAST_3D_URL);

// Eagerly start warming the fastest Spaces at module load so the first request
// doesn't pay full cold-start. Subsequent calls reuse the same promise.
void warmupTrellis();
void warmupStableFast3D();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Hard timeout wrapper. Guarantees a provider call can never hang the request:
 * `@gradio/client` connect/predict and `fal.subscribe` have no built-in
 * timeout, so a sleeping HF Space or stuck queue would otherwise block until
 * Vercel kills the whole function. On timeout we reject and the caller advances
 * to the next provider; the underlying promise is abandoned (harmless).
 */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Upload raw image bytes to Vercel Blob and return a public https URL. Tripo and
 * Meshy accept an image *URL* only (not inline base64), so a user-uploaded photo
 * must be hosted first. Returns null when Blob isn't configured.
 */
async function uploadImageToBlob(base64: string, mime: string): Promise<string | null> {
  try {
    const { isVercelBlobConfigured } = await import("@/lib/vercel-blob");
    if (!isVercelBlobConfigured()) return null;
    const { put } = await import("@vercel/blob");
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const name = `ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(name, Buffer.from(base64, "base64"), {
      access: "public",
      contentType: mime,
      addRandomSuffix: false
    });
    return blob.url;
  } catch {
    return null;
  }
}

export type GeneratorAttempt = {
  provider: string;
  ok: boolean;
  error?: string;
  sizeBytes?: number;
  triangleCount?: number;
};

export type GlbValidation = {
  ok: boolean;
  reason: string | null;
  sizeBytes: number;
  triangleCount?: number;
};

// Minimum GLB size for a real mesh. The placeholder route returns ~120 bytes;
// real provider outputs are typically ≥ 50KB even for low-poly assets.
const MIN_GLB_BYTES = 2048;

async function validateGlbUrl(url: string): Promise<GlbValidation> {
  // Skip validation for our own placeholder route — it's intentionally tiny.
  if (url.startsWith("/api/3d/placeholder") || url.includes("/placeholder?")) {
    return { ok: false, reason: "Placeholder URL", sizeBytes: 0 };
  }

  try {
    // Fetch the first 32KB. That's enough to read the GLB header + JSON chunk
    // (where mesh primitives live) without downloading the whole binary payload.
    const res = await fetch(url, {
      headers: { Range: "bytes=0-32767", ...providerAuthHeaders(url) },
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok && res.status !== 206) {
      return { ok: false, reason: `HTTP ${res.status}`, sizeBytes: 0 };
    }

    const contentRange = res.headers.get("content-range");
    const totalSize = contentRange?.match(/\/(\d+)$/)?.[1]
      ? Number(contentRange.match(/\/(\d+)$/)?.[1])
      : Number(res.headers.get("content-length") ?? 0);
    const buf = Buffer.from(await res.arrayBuffer());

    if (totalSize > 0 && totalSize < MIN_GLB_BYTES) {
      return { ok: false, reason: `File too small (${totalSize} bytes)`, sizeBytes: totalSize };
    }

    // GLB magic: 'glTF' = 0x46546C67 (little endian)
    if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) {
      return { ok: false, reason: "Not a valid GLB (magic mismatch)", sizeBytes: totalSize || buf.length };
    }

    // Parse JSON chunk to count primitives.
    let triangleCount: number | undefined;
    try {
      const jsonChunkLength = buf.readUInt32LE(12);
      const jsonChunkType = buf.readUInt32LE(16); // 'JSON' = 0x4E4F534A
      if (jsonChunkType === 0x4e4f534a && jsonChunkLength > 0 && jsonChunkLength < buf.length - 20) {
        const jsonText = buf.subarray(20, 20 + jsonChunkLength).toString("utf-8");
        const gltf = JSON.parse(jsonText) as {
          meshes?: Array<{ primitives?: Array<{ indices?: number }> }>;
          accessors?: Array<{ count?: number }>;
        };
        const meshes = gltf.meshes ?? [];
        let totalIndices = 0;
        for (const mesh of meshes) {
          for (const prim of mesh.primitives ?? []) {
            if (typeof prim.indices === "number" && gltf.accessors?.[prim.indices]?.count) {
              totalIndices += gltf.accessors[prim.indices].count ?? 0;
            }
          }
        }
        if (totalIndices > 0) triangleCount = Math.floor(totalIndices / 3);
      }
    } catch {
      // Header parse failed — not fatal; size + magic already passed.
    }

    if (triangleCount !== undefined && triangleCount < 50) {
      return {
        ok: false,
        reason: `Degenerate mesh (${triangleCount} triangles)`,
        sizeBytes: totalSize || buf.length,
        triangleCount
      };
    }

    return {
      ok: true,
      reason: null,
      sizeBytes: totalSize || buf.length,
      triangleCount
    };
  } catch (err) {
    const msg = errMessage(err);
    return { ok: false, reason: msg.slice(0, 100), sizeBytes: 0 };
  }
}

async function generateViaHunyuan3D(
  refUrl: string,
  brief: ThreeDBrief,
  userToken?: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const HF_TOKEN = userToken || process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) {
      return { url: null, error: "HUGGINGFACE_TOKEN not set on server" };
    }

    void warmupHunyuan3D();
    const client = await Client.connect(HUNYUAN3D_SPACE, { hf_token: HF_TOKEN as `hf_${string}` });

    const imgData = await fetchImageAsBase64(refUrl);
    if (!imgData) return { url: null, error: "Reference image fetch failed (timeout or 4xx)" };

    const blob = new Blob([Buffer.from(imgData.base64, "base64")], { type: imgData.mediaType });
    const result = await client.predict("/generation_all", {
      caption: brief.description.slice(0, 200),
      image: blob,
      mv_image_front: null,
      mv_image_back: null,
      mv_image_left: null,
      mv_image_right: null,
      steps: brief.polygonBudget === "high" ? 50 : 30,
      guidance_scale: 7.5,
      seed: 42,
      octree_resolution: brief.polygonBudget === "high" ? 256 : 128,
      check_box_rembg: true,
      num_chunks: 8000,
      randomize_seed: false
    });

    const data = result.data as unknown;
    // /generation_all returns [shape_glb, textured_glb, html, stats, seed].
    // Prefer the textured GLB at index 1; fall back to shape at index 0.
    if (Array.isArray(data)) {
      const candidates = [data[1], data[0]].filter((d) => d !== undefined && d !== null);
      for (const item of candidates) {
        if (typeof item === "string" && item.includes(".glb")) return { url: item, error: null };
        if (isRecord(item)) {
          if (typeof item.url === "string" && item.url.includes(".glb")) return { url: item.url, error: null };
          if (typeof item.path === "string" && item.path.includes(".glb")) return { url: item.path, error: null };
          if (typeof item.value === "string" && item.value.includes(".glb")) return { url: item.value, error: null };
        }
      }
    }
    return { url: null, error: "Hunyuan3D returned no GLB in response" };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[HUNYUAN3D]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

function extractGlbFromGradio(data: unknown): string | null {
  const flat: unknown[] = Array.isArray(data) ? data : [data];
  // Prefer textured GLB at index 1 if present
  const ordered = flat.length > 1 ? [flat[1], flat[0], ...flat.slice(2)] : flat;
  for (const item of ordered) {
    if (typeof item === "string" && item.includes(".glb")) return item;
    if (isRecord(item)) {
      if (typeof item.url === "string" && item.url.includes(".glb")) return item.url;
      if (typeof item.path === "string" && item.path.includes(".glb")) return item.path;
      if (typeof item.value === "string" && item.value.includes(".glb")) return item.value;
    }
  }
  return null;
}

async function generateViaTrellis2HF(
  refUrl: string,
  userToken?: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const HF_TOKEN = userToken || process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return { url: null, error: "HUGGINGFACE_TOKEN not set on server" };

    void warmupTrellis();
    const client = await Client.connect(TRELLIS_SPACE, { hf_token: HF_TOKEN as `hf_${string}` });

    const imgData = await fetchImageAsBase64(refUrl);
    if (!imgData) return { url: null, error: "Reference image fetch failed" };

    const blob = new Blob([Buffer.from(imgData.base64, "base64")], { type: imgData.mediaType });

    // TRELLIS pipeline: preprocess → generate_and_extract_glb.
    const pre = (await client.predict("/preprocess_image", { image: blob })) as { data: unknown[] };
    const preprocessed = pre.data?.[0];
    if (!preprocessed) return { url: null, error: "TRELLIS preprocess returned no image" };

    const result = (await client.predict("/generate_and_extract_glb", {
      image: preprocessed,
      multiimages: [],
      seed: 42,
      ss_guidance_strength: 7.5,
      ss_sampling_steps: 12,
      slat_guidance_strength: 3,
      slat_sampling_steps: 12,
      multiimage_algo: "stochastic",
      mesh_simplify: 0.95,
      texture_size: 1024
    })) as { data: unknown };

    const url = extractGlbFromGradio(result.data);
    if (!url) return { url: null, error: "TRELLIS returned no GLB in response" };
    return { url, error: null };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[TRELLIS-2 HF]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

/**
 * Microsoft's official TRELLIS.2 Space (Dec 2025, MIT, ZeroGPU). Session-based
 * gradio flow: start_session → preprocess_image → image_to_3d → extract_glb.
 * State lives server-side per client session, so one Client instance must be
 * used for the whole sequence.
 */
async function generateViaTrellis2Official(
  refUrl: string,
  brief: ThreeDBrief,
  userToken?: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const HF_TOKEN = userToken || process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return { url: null, error: "HUGGINGFACE_TOKEN not set on server" };

    void warmupTrellis2();
    const client = await Client.connect(TRELLIS2_SPACE, { hf_token: HF_TOKEN as `hf_${string}` });

    const imgData = await fetchImageAsBase64(refUrl);
    if (!imgData) return { url: null, error: "Reference image fetch failed" };
    const blob = new Blob([Buffer.from(imgData.base64, "base64")], { type: imgData.mediaType });

    await client.predict("/start_session", {});
    const pre = (await client.predict("/preprocess_image", { input: blob })) as { data: unknown[] };
    const preprocessed = pre.data?.[0];
    if (!preprocessed) return { url: null, error: "TRELLIS.2 preprocess returned no image" };

    await client.predict("/image_to_3d", {
      image: preprocessed,
      seed: 42,
      resolution: brief.polygonBudget === "high" ? "1536" : "1024",
      ss_guidance_strength: 7.5,
      ss_guidance_rescale: 0.7,
      ss_sampling_steps: 12,
      ss_rescale_t: 5.0,
      shape_slat_guidance_strength: 7.5,
      shape_slat_guidance_rescale: 0.5,
      shape_slat_sampling_steps: 12,
      shape_slat_rescale_t: 3.0,
      tex_slat_guidance_strength: 1.0,
      tex_slat_guidance_rescale: 0.0,
      tex_slat_sampling_steps: 12,
      tex_slat_rescale_t: 3.0
    });

    const result = (await client.predict("/extract_glb", {
      decimation_target: brief.polygonBudget === "high" ? 300000 : 100000,
      texture_size: brief.polygonBudget === "high" ? 2048 : 1024
    })) as { data: unknown };

    const url = extractGlbFromGradio(result.data);
    if (!url) return { url: null, error: "TRELLIS.2 returned no GLB" };
    return { url, error: null };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[TRELLIS.2]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

async function generateViaInstantMesh(
  refUrl: string,
  userToken?: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const HF_TOKEN = userToken || process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return { url: null, error: "HUGGINGFACE_TOKEN not set on server" };

    void warmupInstantMesh();
    const client = await Client.connect(INSTANTMESH_SPACE, { hf_token: HF_TOKEN as `hf_${string}` });

    const imgData = await fetchImageAsBase64(refUrl);
    if (!imgData) return { url: null, error: "Reference image fetch failed" };

    const blob = new Blob([Buffer.from(imgData.base64, "base64")], { type: imgData.mediaType });

    // InstantMesh pipeline: preprocess → generate_mvs → make3d
    const pre = (await client.predict("/preprocess", {
      input_image: blob,
      do_remove_background: true
    })) as { data: unknown[] };
    const processed = pre.data?.[0];
    if (!processed) return { url: null, error: "InstantMesh preprocess returned no image" };

    await client.predict("/generate_mvs", {
      input_image: processed,
      sample_steps: 75,
      sample_seed: 42
    });

    const result = (await client.predict("/make3d", {})) as { data: unknown };
    const url = extractGlbFromGradio(result.data);
    if (!url) return { url: null, error: "InstantMesh returned no GLB" };
    return { url, error: null };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[INSTANTMESH]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

async function generateViaStableFast3D(
  refUrl: string,
  userToken?: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const HF_TOKEN = userToken || process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return { url: null, error: "HUGGINGFACE_TOKEN not set on server" };

    void warmupStableFast3D();
    const client = await Client.connect(STABLE_FAST_3D_SPACE, { hf_token: HF_TOKEN as `hf_${string}` });

    const imgData = await fetchImageAsBase64(refUrl);
    if (!imgData) return { url: null, error: "Reference image fetch failed" };

    const blob = new Blob([Buffer.from(imgData.base64, "base64")], { type: imgData.mediaType });

    // /requires_bg_remove is the single-shot endpoint: image + foreground ratio →
    // [state, state, preview, button, litmodel3d, column]. The 3D model
    // is at index 4 (litmodel3d component).
    const result = (await client.predict("/requires_bg_remove", {
      image: blob,
      fr: 0.85
    })) as { data: unknown };

    const data = result.data as unknown;
    if (Array.isArray(data)) {
      // litmodel3d output object: { value: { url, path } } or { url } directly
      for (const item of data) {
        if (typeof item === "string" && item.includes(".glb")) return { url: item, error: null };
        if (isRecord(item)) {
          if (typeof item.url === "string" && item.url.includes(".glb")) return { url: item.url, error: null };
          if (typeof item.path === "string" && item.path.includes(".glb")) return { url: item.path, error: null };
          if (isRecord(item.value)) {
            const v = item.value as Record<string, unknown>;
            if (typeof v.url === "string" && v.url.includes(".glb")) return { url: v.url, error: null };
            if (typeof v.path === "string" && v.path.includes(".glb")) return { url: v.path, error: null };
          }
        }
      }
    }
    return { url: null, error: "Stable Fast 3D returned no GLB" };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[STABLE-FAST-3D]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

async function generateViaFalTrellis(refUrl: string): Promise<{ url: string | null; error: string | null }> {
  try {
    const falKey = process.env.FAL_KEY;
    if (!falKey) return { url: null, error: "FAL_KEY not set (paid fallback skipped)" };
    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: falKey });

    const imgData = await fetchImageAsBase64(refUrl);
    if (!imgData) return { url: null, error: "Reference image fetch failed for Trellis" };

    type FalResult = { data?: { model_glb?: { url?: string }; model_mesh?: { url?: string } } };
    const result = await (fal.subscribe as (m: string, o: unknown) => Promise<FalResult>)(
      process.env.FAL_TRELLIS_MODEL ?? "fal-ai/trellis-2",
      {
        input: { image_url: `data:${imgData.mediaType};base64,${imgData.base64}`, texture_size: "1024" },
        logs: false
      }
    );
    const url = result?.data?.model_glb?.url ?? result?.data?.model_mesh?.url ?? null;
    if (!url) return { url: null, error: "Trellis returned no GLB" };
    return { url, error: null };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[TRELLIS]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

// fal Hunyuan3D — fast, reliable managed image→3D with embedded PBR. Covered by
// fal's free signup credits, then ~$0.16–0.22 a generation. Accepts a data URI,
// so it works for both user uploads and synthesized studio photos.
async function generateViaFalHunyuan(refUrl: string): Promise<{ url: string | null; error: string | null }> {
  try {
    const falKey = process.env.FAL_KEY;
    if (!falKey) return { url: null, error: "FAL_KEY not set" };
    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: falKey });

    const imgData = await fetchImageAsBase64(refUrl);
    if (!imgData) return { url: null, error: "Reference image fetch failed" };
    const dataUri = `data:${imgData.mediaType};base64,${imgData.base64}`;

    type FalResult = {
      data?: {
        model_glb?: { url?: string };
        model_glb_pbr?: { url?: string };
        model_mesh?: { url?: string };
      };
    };
    const result = await (fal.subscribe as (m: string, o: unknown) => Promise<FalResult>)(
      process.env.FAL_HUNYUAN_MODEL ?? "fal-ai/hunyuan3d/v2",
      {
        input: { input_image_url: dataUri, image_url: dataUri, textured_mesh: true },
        logs: false
      }
    );
    const url =
      result?.data?.model_glb_pbr?.url ??
      result?.data?.model_glb?.url ??
      result?.data?.model_mesh?.url ??
      null;
    if (!url) return { url: null, error: "fal hunyuan returned no GLB" };
    return { url, error: null };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[FAL-HUNYUAN]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

// fal Hunyuan3D multi-view — the video-capture path. Takes front/back/left
// views of the SAME object (segmented on-device from a walk-around clip) and
// reconstructs geometry the single-image path has to hallucinate. Schema per
// fal-ai/hunyuan3d/v2/multi-view: all three *_image_url fields are required,
// which is why the cascade only enables this entry when 3 views exist.
async function generateViaFalHunyuanMultiView(
  frontDataUri: string,
  leftDataUri: string,
  backDataUri: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const falKey = process.env.FAL_KEY;
    if (!falKey) return { url: null, error: "FAL_KEY not set" };
    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: falKey });

    type FalResult = { data?: { model_mesh?: { url?: string }; model_glb?: { url?: string } } };
    const result = await (fal.subscribe as (m: string, o: unknown) => Promise<FalResult>)(
      process.env.FAL_HUNYUAN_MV_MODEL ?? "fal-ai/hunyuan3d/v2/multi-view",
      {
        input: {
          front_image_url: frontDataUri,
          left_image_url: leftDataUri,
          back_image_url: backDataUri,
          textured_mesh: true
        },
        logs: false
      }
    );
    const url = result?.data?.model_glb?.url ?? result?.data?.model_mesh?.url ?? null;
    if (!url) return { url: null, error: "fal hunyuan multi-view returned no GLB" };
    return { url, error: null };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[FAL-HUNYUAN-MV]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

// Tripo image→3D. Free tier ~200 credits/month; async create-then-poll. Needs a
// public image URL (use uploadImageToBlob for user uploads). Contract mirrors
// services/scene/providers/tripo.ts.
async function generateViaTripo(publicUrl: string): Promise<{ url: string | null; error: string | null }> {
  try {
    const key = process.env.TRIPO_API_KEY;
    if (!key) return { url: null, error: "TRIPO_API_KEY not set" };
    const base = process.env.TRIPO_API_URL ?? "https://api.tripo3d.ai/v2/openapi";

    const createRes = await fetch(`${base}/task`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "image_to_model",
        file: { type: "url", url: publicUrl },
        model_version: process.env.TRIPO_MODEL_VERSION ?? "v2.5-20250123",
        texture: true,
        pbr: true
      }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!createRes.ok) return { url: null, error: `tripo create ${createRes.status}` };
    const created = (await createRes.json()) as { code?: number; data?: { task_id?: string } };
    const taskId = created?.data?.task_id;
    if (created?.code !== 0 || !taskId) return { url: null, error: "tripo returned no task_id" };

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await sleep(2500);
      const statusRes = await fetch(`${base}/task/${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);
      if (!statusRes || !statusRes.ok) continue;
      const status = (await statusRes.json()) as {
        data?: { status?: string; output?: { pbr_model?: string; model?: string }; error?: { message?: string } };
      };
      const d = status?.data;
      if (!d) continue;
      if (d.status === "success") {
        const glb = d.output?.pbr_model ?? d.output?.model;
        return glb ? { url: glb, error: null } : { url: null, error: "tripo success but no model" };
      }
      if (d.status === "failed" || d.status === "banned" || d.status === "cancelled") {
        return { url: null, error: `tripo ${d.status}: ${d.error?.message ?? ""}`.trim() };
      }
    }
    return { url: null, error: "tripo timed out" };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[TRIPO]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

// Meshy image→3D. Free tier ~200 credits/month; async create-then-poll. Needs a
// public image URL. Returns a textured GLB with PBR when enabled.
async function generateViaMeshy(publicUrl: string): Promise<{ url: string | null; error: string | null }> {
  try {
    const key = process.env.MESHY_API_KEY;
    if (!key) return { url: null, error: "MESHY_API_KEY not set" };

    const createRes = await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: publicUrl, enable_pbr: true, should_texture: true }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!createRes.ok) return { url: null, error: `meshy create ${createRes.status}` };
    const created = (await createRes.json()) as { result?: string; id?: string };
    const taskId = created?.result ?? created?.id;
    if (!taskId) return { url: null, error: "meshy returned no task id" };

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await sleep(3000);
      const statusRes = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);
      if (!statusRes || !statusRes.ok) continue;
      const d = (await statusRes.json()) as { status?: string; model_urls?: { glb?: string } };
      if (d?.status === "SUCCEEDED") {
        const glb = d.model_urls?.glb;
        return glb ? { url: glb, error: null } : { url: null, error: "meshy succeeded but no glb" };
      }
      if (d?.status === "FAILED" || d?.status === "EXPIRED") {
        return { url: null, error: `meshy ${d.status}` };
      }
    }
    return { url: null, error: "meshy timed out" };
  } catch (err) {
    const msg = errMessage(err);
    console.error("[MESHY]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

type ProviderDescriptor = {
  name: string;
  tier: GeneratedAsset["tier"];
  run: () => Promise<{ url: string | null; error: string | null }>;
};

/**
 * Race a set of provider descriptors. The first one that returns a
 * validated GLB wins. Losing providers are still recorded in `attempts`
 * with their outcome (so the user log explains the cost). If all fail
 * the function returns null and the caller falls through to the next tier.
 */
type CascadeEntry = ProviderDescriptor & { enabled: boolean; timeoutMs: number };

// Default order: most reliable + fastest first, free fallbacks last. Each entry
// is skipped instantly when its key is absent, so a deploy with only some keys
// just uses what it has. Override with YIIYA_PROVIDER_ORDER (comma-separated
// keys) to e.g. prefer free monthly tiers (tripo,meshy) over fal credits.
const DEFAULT_PROVIDER_ORDER = [
  "fal-hunyuan-mv",
  "fal-hunyuan",
  "fal-trellis",
  "tripo",
  "meshy",
  "hf-trellis2",
  "hf-trellis",
  "hf-hunyuan",
  "hf-stablefast",
  "hf-instantmesh"
];

async function runSpatialGenerator(
  brief: ThreeDBrief,
  groundingResult: ReferenceGroundingResult,
  userImageBase64?: string | null,
  userImageMime?: string | null,
  userHfToken?: string,
  additionalViews?: Array<{ base64: string; mediaType: string }>
): Promise<{ glbUrl: string; tier: GeneratedAsset["tier"]; attempts: GeneratorAttempt[] }> {
  const attempts: GeneratorAttempt[] = [];
  const placeholder = (): { glbUrl: string; tier: GeneratedAsset["tier"]; attempts: GeneratorAttempt[] } => ({
    glbUrl: `/api/3d/placeholder?name=${encodeURIComponent(brief.primaryObject)}`,
    tier: "fallback",
    attempts
  });

  // User upload → data URI fed directly to image-to-3D models (never re-imagined
  // through Pollinations). Text prompt → the studio photo grounded above.
  const inputRef = userImageBase64
    ? `data:${userImageMime ?? "image/jpeg"};base64,${userImageBase64}`
    : groundingResult.referenceImages[0] ?? null;

  if (!inputRef) {
    attempts.push({ provider: "none", ok: false, error: "No reference image available" });
    return placeholder();
  }

  // Lazily resolve a public https URL for providers (Tripo/Meshy) that require
  // one. Already-http refs (Pollinations) pass through; user data URIs are
  // uploaded to Blob on first need only.
  let publicUrlResolved: string | null | undefined;
  const publicUrl = async (): Promise<string | null> => {
    if (publicUrlResolved !== undefined) return publicUrlResolved;
    if (inputRef.startsWith("http")) publicUrlResolved = inputRef;
    else if (userImageBase64) publicUrlResolved = await uploadImageToBlob(userImageBase64, userImageMime ?? "image/jpeg");
    else publicUrlResolved = null;
    return publicUrlResolved;
  };
  const needsUrl = async (run: (u: string) => Promise<{ url: string | null; error: string | null }>) => {
    const u = await publicUrl();
    if (!u) return { url: null, error: "needs a public image URL (set BLOB_READ_WRITE_TOKEN)" };
    return run(u);
  };

  const hasFal = Boolean(process.env.FAL_KEY);
  // A user-supplied HF token (Settings → "Use your own HuggingFace token")
  // unlocks that user's own free ZeroGPU quota instead of the shared
  // server-side one, so HF providers stay enabled even without a server
  // token as long as the request brought its own.
  const hasHf = Boolean(userHfToken || process.env.HUGGINGFACE_TOKEN);
  // Multi-view runs only when the video capture produced BOTH extra views —
  // fal's multi-view schema requires front+left+back, no partial input.
  const mvViews =
    userImageBase64 && additionalViews && additionalViews.length >= 2
      ? {
          front: `data:${userImageMime ?? "image/png"};base64,${userImageBase64}`,
          left: `data:${additionalViews[0].mediaType};base64,${additionalViews[0].base64}`,
          back: `data:${additionalViews[1].mediaType};base64,${additionalViews[1].base64}`
        }
      : null;
  const entries: Record<string, CascadeEntry> = {
    "fal-hunyuan-mv": {
      name: "hunyuan3d multi-view (fal)",
      tier: "hunyuan3d",
      enabled: hasFal && Boolean(mvViews),
      timeoutMs: 110_000,
      run: () => generateViaFalHunyuanMultiView(mvViews!.front, mvViews!.left, mvViews!.back)
    },
    "fal-hunyuan": { name: "hunyuan3d (fal)", tier: "hunyuan3d", enabled: hasFal, timeoutMs: 95_000, run: () => generateViaFalHunyuan(inputRef) },
    "fal-trellis": { name: "trellis-2 (fal)", tier: "trellis", enabled: hasFal, timeoutMs: 95_000, run: () => generateViaFalTrellis(inputRef) },
    "tripo": { name: "tripo", tier: "trellis", enabled: Boolean(process.env.TRIPO_API_KEY), timeoutMs: 95_000, run: () => needsUrl(generateViaTripo) },
    "meshy": { name: "meshy", tier: "hunyuan3d", enabled: Boolean(process.env.MESHY_API_KEY), timeoutMs: 125_000, run: () => needsUrl(generateViaMeshy) },
    "hf-trellis2": { name: "trellis-2 (hf official)", tier: "trellis", enabled: hasHf, timeoutMs: 120_000, run: () => generateViaTrellis2Official(inputRef, brief, userHfToken) },
    "hf-trellis": { name: "trellis (hf)", tier: "trellis", enabled: hasHf, timeoutMs: 60_000, run: () => generateViaTrellis2HF(inputRef, userHfToken) },
    "hf-hunyuan": { name: "hunyuan3d (hf)", tier: "hunyuan3d", enabled: hasHf, timeoutMs: 90_000, run: () => generateViaHunyuan3D(inputRef, brief, userHfToken) },
    "hf-stablefast": { name: "stable-fast-3d (hf)", tier: "library", enabled: hasHf, timeoutMs: 45_000, run: () => generateViaStableFast3D(inputRef, userHfToken) },
    "hf-instantmesh": { name: "instantmesh (hf)", tier: "library", enabled: hasHf, timeoutMs: 60_000, run: () => generateViaInstantMesh(inputRef, userHfToken) }
  };

  const order = (process.env.YIIYA_PROVIDER_ORDER?.split(",").map((s) => s.trim()).filter(Boolean)) ?? DEFAULT_PROVIDER_ORDER;

  // Hard overall deadline (under the 300s function cap) so the whole cascade is
  // guaranteed to terminate even if several providers each crawl to timeout.
  const deadline = Date.now() + 270_000;

  for (const key of order) {
    const entry = entries[key];
    if (!entry || !entry.enabled) continue;
    const remaining = deadline - Date.now();
    if (remaining < 8_000) break;

    let out: { url: string | null; error: string | null };
    try {
      out = await withTimeout(entry.run(), Math.min(entry.timeoutMs, remaining), entry.name);
    } catch (err) {
      out = { url: null, error: err instanceof Error ? err.message : "provider error" };
    }

    if (!out.url) {
      attempts.push({ provider: entry.name, ok: false, error: out.error ?? undefined });
      continue;
    }

    const v = await validateGlbUrl(out.url).catch(
      () => ({ ok: false, reason: "validation error", sizeBytes: 0 } as GlbValidation)
    );
    attempts.push({
      provider: entry.name,
      ok: v.ok,
      error: v.ok ? undefined : `${v.reason ?? "validation failed"} — trying next`,
      sizeBytes: v.sizeBytes || undefined,
      triangleCount: v.triangleCount
    });
    if (v.ok) {
      const mirror = await mirrorGlbToBlob(out.url, brief.primaryObject).catch(
        () => ({ url: out.url as string, mirrored: false, sizeBytes: 0 })
      );
      // Mirror failed (no Blob token, upstream hiccup, …). Never hand the
      // browser a raw provider URL — HF Space temp files 403 for anonymous
      // GETs and expire in minutes. Serve through our authenticated proxy.
      const glbUrl =
        mirror.mirrored || !isAllowedProviderUrl(mirror.url)
          ? mirror.url
          : `/api/3d/proxy?src=${encodeURIComponent(mirror.url)}`;
      return { glbUrl, tier: entry.tier, attempts };
    }
  }

  if (attempts.length === 0) {
    attempts.push({
      provider: "none",
      ok: false,
      error: "No 3D provider configured. Set FAL_KEY, TRIPO_API_KEY, MESHY_API_KEY, or HUGGINGFACE_TOKEN."
    });
  }
  return placeholder();
}

// ─── Agent 4 — Material Artist ────────────────────────────────────────────────

async function generatePBRTextures(brief: ThreeDBrief): Promise<GeneratedAsset["textureUrls"]> {
  const style = brief.styleTags.join(", ") || "realistic";
  return {
    albedo: pollinationsUrl(`seamless PBR albedo texture, ${style}, ${brief.materialBrief.textureStyle}, base color ${brief.materialBrief.baseColor}, tiling, flat studio lighting`, 1024, 1024),
    normal: pollinationsUrl(`seamless normal map texture, ${style}, blue-purple tangent-space surface detail normals`, 1024, 1024)
  };
}

function estimateScale(brief: ThreeDBrief): number {
  const obj = brief.primaryObject.toLowerCase();
  const map: [string, number][] = [
    ["character", 1.8], ["person", 1.8], ["human", 1.8], ["warrior", 1.8],
    ["car", 4.5], ["truck", 6], ["motorcycle", 2.2], ["vehicle", 4.5],
    ["building", 10], ["house", 8], ["door", 2.1],
    ["sword", 1.2], ["shield", 0.8], ["helmet", 0.3], ["dagger", 0.4], ["axe", 0.9],
    ["table", 0.8], ["chair", 0.9], ["desk", 0.75], ["lamp", 1.5],
    ["barrel", 0.8], ["crate", 0.6], ["chest", 0.5], ["box", 0.4],
    ["cup", 0.1], ["mug", 0.12], ["bottle", 0.25], ["bowl", 0.1],
    ["phone", 0.15], ["laptop", 0.03], ["watch", 0.05],
    ["tree", 5], ["rock", 0.5], ["stone", 0.4], ["crystal", 0.2]
  ];
  for (const [key, scale] of map) {
    if (obj.includes(key)) return scale;
  }
  return 1.0;
}

// ─── Agent 5 — Packager ───────────────────────────────────────────────────────

async function runPackager(
  brief: ThreeDBrief,
  glbUrl: string,
  tier: GeneratedAsset["tier"],
  textureUrls: GeneratedAsset["textureUrls"],
  triangleCount?: number
): Promise<GeneratedAsset> {
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Only advertise formats /api/3d/convert genuinely produces. USD needs an
  // external converter (lib/scene/usdz-export.ts) — offer it only when one
  // is configured, so users never download a mislabeled file.
  const exportUrls: GeneratedAsset["exportUrls"] =
    tier === "fallback"
      ? {}
      : buildExportUrls(glbUrl, { usdzConfigured: Boolean(process.env.USDZ_CONVERTER_URL) });

  return {
    id,
    name: brief.primaryObject,
    glbUrl,
    tier,
    triangleCount,
    materialBrief: brief.materialBrief,
    textureUrls,
    exportUrls,
    scaleMeters: estimateScale(brief),
    isWatertight: tier !== "fallback"
  };
}

// ─── Retexture fast path (Phase 11) ───────────────────────────────────────────

/**
 * material_edit on an existing mesh → Meshy text-to-texture: keeps the
 * geometry, regenerates only the textures. Runs INSTEAD of the full provider
 * cascade (and before Pollinations grounding, which a retexture never needs).
 *
 * Returns true when it produced a terminal event stream (asset or honest
 * failure) — the caller must stop. Returns false when retexture wasn't
 * attempted (no key / unusable URL / create-call rejected before a task
 * existed), in which case falling through to the normal pipeline costs
 * nothing extra and matches pre-Phase-11 behavior.
 */
async function* runRetexturePath(
  body: InterpretRequestBody,
  brief: ThreeDBrief
): AsyncGenerator<PipelineEvent, boolean> {
  const modelUrl = body.activeAssetGlbUrl;
  if (!process.env.MESHY_API_KEY) {
    yield { type: "generating", log: "[RETEXTURE] Material edit detected but MESHY_API_KEY is not set — re-rolling the whole mesh instead.", progress: 0.1 };
    return false;
  }
  if (!canRetextureModelUrl(modelUrl)) {
    yield { type: "generating", log: "[RETEXTURE] Active asset has no public mesh URL to retexture — re-rolling the whole mesh instead.", progress: 0.1 };
    return false;
  }

  yield {
    type: "generating",
    log: `[RETEXTURE] "${brief.primaryObject}" — same geometry, new skin via Meshy text-to-texture. This takes ~1–3 min…`,
    progress: 0.2
  };

  const out = await retextureViaMeshy(modelUrl, body.transcript);

  if (!out.url) {
    if (!out.taskCreated) {
      // Failed before Meshy accepted a task — zero credits spent, and the
      // clock barely moved, so the normal cascade is still a safe fallback.
      yield { type: "generating", log: `[RETEXTURE] ${out.error} — no task created (0 credits). Falling back to full regeneration.`, progress: 0.1 };
      return false;
    }
    // A task ran and failed (or timed out): credits may be gone and there is
    // no time budget left for a full cascade on top. Stop honestly instead of
    // silently re-rolling geometry the user asked to keep.
    yield { type: "generating", log: `[RETEXTURE] ${out.error}. Your mesh is untouched — nothing changed. Reword the edit to retry, or ask to "regenerate" for a fresh mesh.`, progress: 0.1 };
    const qa_log = ["[QA] Retexture failed — original mesh preserved, no new asset."];
    yield { type: "qa", qa_log };
    yield { type: "done", assets: [], brief, qa_log };
    return true;
  }

  const v = await validateGlbUrl(out.url).catch(
    () => ({ ok: false, reason: "validation error", sizeBytes: 0 } as GlbValidation)
  );
  if (!v.ok) {
    yield { type: "generating", log: `[RETEXTURE] Meshy returned an unusable GLB (${v.reason}). Your mesh is untouched.`, progress: 0.1 };
    const qa_log = ["[QA] Retexture output failed validation — original mesh preserved."];
    yield { type: "qa", qa_log };
    yield { type: "done", assets: [], brief, qa_log };
    return true;
  }

  const creditNote = out.consumedCredits !== null ? `${out.consumedCredits} Meshy credits` : "credit count not reported";
  yield { type: "generating", log: `[RETEXTURE] Textures ready (${creditNote}), packaging exports...`, progress: 0.8 };

  const mirror = await mirrorGlbToBlob(out.url, `${brief.primaryObject}-retexture`).catch(
    () => ({ url: out.url as string, mirrored: false, sizeBytes: 0 })
  );
  const glbUrl =
    mirror.mirrored || !isAllowedProviderUrl(mirror.url)
      ? mirror.url
      : `/api/3d/proxy?src=${encodeURIComponent(mirror.url)}`;

  const asset = await runPackager(brief, glbUrl, "hunyuan3d", out.textureUrls, v.triangleCount);
  asset.sourceGlbUrl = modelUrl;

  yield {
    type: "asset_ready",
    asset,
    log: `[READY] "${asset.name}" — retextured, geometry preserved (${creditNote}), ${Object.keys(asset.exportUrls).join("/")}`
  };
  const qa_log = [
    `[QA] Retexture: geometry untouched, textures regenerated by Meshy (${creditNote}).`,
    `[QA] Scale: 1 unit = 1 meter (Blender/UE5/Unity standard).`,
    `[QA] Pipeline: Director → Meshy text-to-texture → Packager (cascade skipped)`
  ];
  yield { type: "qa", qa_log };
  yield { type: "done", assets: [asset], brief, qa_log };
  return true;
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────

export async function* runInterpretPipeline(
  body: InterpretRequestBody
): AsyncGenerator<PipelineEvent> {
  try {
    let brief: ThreeDBrief;
    let directorNote = "";
    try {
      brief = await runDirector(body);
    } catch (err) {
      brief = localDirectorBrief(body);
      directorNote = ` — local fallback (${errMessage(err).slice(0, 80)})`;
      console.error("[DIRECTOR] falling back to local brief:", errMessage(err));
    }
    yield { type: "director", brief, log: `[DIRECTOR] ${brief.intent} → "${brief.primaryObject}" (${brief.useCase}, ${brief.polygonBudget} poly)${directorNote}` };
    const willGate =
      !body.forceGenerate && !body.referenceImage && Boolean(brief.clarifyingQuestion) && brief.confidence < 0.6;
    if (brief.clarifyingQuestion && !willGate) {
      yield { type: "generating", log: `[DIRECTOR] ${brief.clarifyingQuestion} (proceeding with best guess: "${brief.primaryObject}")`, progress: 0.05 };
    }

    // Phase 11: material edits on an existing mesh go through Meshy retexture
    // (same geometry, new textures) instead of re-rolling the whole mesh.
    if (brief.intent === "material_edit" && body.activeAssetGlbUrl && !body.referenceImage) {
      const handled = yield* runRetexturePath(body, brief);
      if (handled) return;
    }

    if (body.referenceImage) {
      const photo = await runPhotoAnalyst(body.referenceImage);
      brief.materialBrief = { ...brief.materialBrief, ...photo.materialBrief };
      if (brief.primaryObject === "object" && photo.primaryObject !== "object") {
        brief.primaryObject = photo.primaryObject;
      }
      yield {
        type: "grounding",
        result: { referenceImages: [], materialBrief: photo.materialBrief, proportions: photo.proportions, analysisNotes: photo.analysisNotes },
        log: `[ANALYST] ${photo.analysisNotes}`
      };
    }

    // Skip Pollinations entirely when the user uploaded an image —
    // image-to-3D models need the real photo, not a re-imagined one.
    const groundingResult = body.referenceImage
      ? {
          referenceImages: [],
          materialBrief: brief.materialBrief,
          analysisNotes: "User-uploaded reference image; Pollinations skipped"
        }
      : await runStudioPhotoGrounding(brief);
    yield {
      type: "grounding",
      result: groundingResult,
      log: body.referenceImage
        ? "[GROUNDER] User photo will be fed directly to the generator"
        : "[GROUNDER] 1 studio reference photo ready via Pollinations.ai"
    };

    // Ambiguity gate: when the Director genuinely can't tell what to build
    // (it asked a question AND its confidence is low), stop BEFORE the paid
    // generation and hand the question to the user. Everything spent so far
    // (Gemini free tier + Pollinations) is free. Vague-but-confident prompts
    // still proceed — vague prompts are a feature, blind gambles are not.
    // A user-supplied photo always overrides the gate: the image IS the answer.
    if (willGate && brief.clarifyingQuestion) {
      yield {
        type: "clarify",
        question: brief.clarifyingQuestion,
        options: brief.suggestions?.slice(0, 3) ?? [],
        previewImage: groundingResult.referenceImages[0] ?? null,
        brief,
        log: `[DIRECTOR] Paused before spending a generation — ${brief.clarifyingQuestion}`
      };
      yield { type: "done", assets: [], brief, qa_log: ["[QA] Clarification requested — no generation spent."] };
      return;
    }

    const styleMatch = body.transcript.match(/\b(lowpoly|low.poly|ps2|cartoon|toon|realistic|pbr|stylized|hand.painted|pixel|voxel|clay|flat)\b/i);
    if (body.sessionStyleDNA || styleMatch) {
      const hint = body.sessionStyleDNA?.styleLabel ?? (styleMatch?.[0] ?? body.transcript);
      const dna = await runStyleDNAEncoder(hint);
      yield { type: "style_dna", dna, log: `[STYLE DNA] Locked: ${dna.styleLabel} (${dna.polyDensity}, ${dna.shadingModel})` };
    }

    const slots = brief.intent === "multi_object_scene" && brief.sceneSlots?.length
      ? brief.sceneSlots
      : [{ name: brief.primaryObject, description: brief.description, relativeScale: 1, materialBrief: brief.materialBrief }];

    const generatedAssets: GeneratedAsset[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotBrief: ThreeDBrief = { ...brief, primaryObject: slot.name, description: slot.description, materialBrief: slot.materialBrief };

      yield { type: "generating", log: `[GENERATOR] "${slot.name}" (${i + 1}/${slots.length}) — Hunyuan3D / TRELLIS / Tripo / Meshy cascade…`, progress: 0.1 + 0.6 * (i / slots.length) };

      const { glbUrl, tier, attempts } = await runSpatialGenerator(
        slotBrief,
        groundingResult,
        body.referenceImage?.base64 ?? null,
        body.referenceImage?.mediaType ?? null,
        body.userHfToken,
        body.referenceImage?.additionalViews
      );
      for (const attempt of attempts) {
        if (!attempt.ok && attempt.error) {
          yield { type: "generating", log: `[GENERATOR ERROR] ${attempt.provider}: ${attempt.error}`, progress: 0.75 };
        }
      }
      const winning = attempts.find((a) => a.ok);
      const sizeMb = winning?.sizeBytes ? (winning.sizeBytes / 1_048_576).toFixed(2) : null;
      const triNote = winning?.triangleCount ? `~${winning.triangleCount.toLocaleString()} tris` : null;
      const sizeNote = [sizeMb ? `${sizeMb}MB` : null, triNote].filter(Boolean).join(", ");
      const meshReadyLog =
        tier === "fallback"
          ? `[GENERATOR] All providers failed — showing placeholder for "${slot.name}". Retry or add a reference image.`
          : sizeNote
            ? `[GENERATOR] Mesh ready (${tier}, ${sizeNote}), packaging exports...`
            : `[GENERATOR] Mesh ready (${tier}), packaging exports...`;
      yield { type: "generating", log: meshReadyLog, progress: 0.8 };

      const textureUrls = tier === "fallback" ? undefined : await generatePBRTextures(slotBrief);
      const asset = await runPackager(slotBrief, glbUrl, tier, textureUrls, winning?.triangleCount);
      generatedAssets.push(asset);

      yield {
        type: "asset_ready",
        asset,
        log:
          asset.tier === "fallback"
            ? `[FAILED] "${asset.name}" — no usable mesh from any provider. Placeholder shown; no exports.`
            : `[READY] "${asset.name}" — ${asset.tier}, ${asset.scaleMeters}m, ${Object.keys(asset.exportUrls).join("/")}`
      };
    }

    // needsLODChain / needsPhysicsMetadata are Director-classified intent flags
    // (e.g. "this is going to UE5") — no /api/3d/lod route or USD physics
    // embedding actually exists, so they must never appear as QA claims. Log
    // only capabilities the pipeline genuinely delivers.
    const qa_log = [
      `[QA] ${generatedAssets.length} asset(s) generated.`,
      `[QA] Scale: 1 unit = 1 meter (Blender/UE5/Unity standard).`,
      `[QA] Pipeline: Director → Grounder → Hunyuan3D / TRELLIS / Tripo / Meshy → PBR → Packager`
    ];

    yield { type: "qa", qa_log };
    yield { type: "done", assets: generatedAssets, brief, qa_log };

  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "Pipeline failed" };
  }
}

export async function runInterpretOnce(body: InterpretRequestBody) {
  const assets: GeneratedAsset[] = [];
  const qa_log: string[] = [];
  let brief: ThreeDBrief | null = null;

  for await (const event of runInterpretPipeline(body)) {
    if (event.type === "director") brief = event.brief;
    if (event.type === "asset_ready") assets.push(event.asset);
    if (event.type === "qa") qa_log.push(...event.qa_log);
    if (event.type === "error") throw new Error(event.message);
  }

  return { assets, brief, qa_log };
}
