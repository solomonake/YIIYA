/**
 * YIIYA — Pure 3D Spatial Pipeline
 * 5 agents: Director → Reference Grounder → Spatial Generator → Material Artist → Packager
 */
import { Client } from "@gradio/client";

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
};

export type ReferenceImageInput = {
  base64: string;
  mediaType: string;
  name: string;
};

export type InterpretRequestBody = {
  transcript: string;
  referenceImage?: ReferenceImageInput | null;
  sessionStyleDNA?: StyleDNA | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  existingAssets?: Array<{ id: string; name: string }>;
};

export type PipelineEvent =
  | { type: "director"; brief: ThreeDBrief; log: string }
  | { type: "grounding"; result: ReferenceGroundingResult; log: string }
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
  "confidence": number
}

Rules:
- hero_asset=high poly, environment_prop=mid poly, character_accessory=high poly
- Unreal/UE5 -> targetPlatform=unreal, priorityFormat=fbx, needsLODChain=true
- Unity -> targetPlatform=unity, priorityFormat=glb
- Blender -> targetPlatform=blender, priorityFormat=glb
- 3d print -> targetPlatform=print, priorityFormat=obj
- Populate sceneSlots only for multi_object_scene intent`;

async function runDirector(body: InterpretRequestBody): Promise<ThreeDBrief> {
  const ctx = JSON.stringify({
    userPrompt: body.transcript,
    hasReferenceImage: Boolean(body.referenceImage),
    sessionStyle: body.sessionStyleDNA?.styleLabel ?? null,
    existingAssets: body.existingAssets ?? [],
    history: body.history?.slice(-3) ?? []
  });

  const text = await callGemini(DIRECTOR_SYSTEM, ctx);
  const parsed = parseJsonFromText(text);
  if (!isRecord(parsed)) throw new Error("Director returned invalid brief");

  const intent = (parsed.intent as ThreeDIntentType) ?? "single_object";
  return {
    intent,
    primaryObject: String(parsed.primaryObject ?? "object"),
    description: String(parsed.description ?? body.transcript),
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
    confidence: Number(parsed.confidence ?? 0.8)
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

// ─── Agent 2b — Multi-View Synthesizer (Pollinations.ai, free) ────────────────

function pollinationsUrl(prompt: string, w = 512, h = 512): string {
  const seed = Math.floor(Math.random() * 99999);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&enhance=true&seed=${seed}`;
}

async function runMultiViewSynthesizer(brief: ThreeDBrief): Promise<ReferenceGroundingResult> {
  const obj = brief.primaryObject;
  const style = brief.styleTags.join(", ") || "realistic";
  const mat = brief.materialBrief.textureStyle;
  const base = `single isolated ${obj}, ${style}, ${mat}, studio white background, neutral lighting, no shadows, product photography`;

  const referenceImages = [
    pollinationsUrl(`front orthographic view, ${base}`, 512, 512),
    pollinationsUrl(`right side orthographic view, ${base}`, 512, 512),
    pollinationsUrl(`back orthographic view, ${base}`, 512, 512),
    pollinationsUrl(`top-down orthographic view, ${base}`, 512, 512)
  ];

  return {
    referenceImages,
    materialBrief: brief.materialBrief,
    analysisNotes: `${referenceImages.length} orthographic reference views via Pollinations.ai`
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

let hunyuanWarmupPromise: Promise<void> | null = null;
function warmupHunyuan3D(): Promise<void> {
  if (!hunyuanWarmupPromise) {
    hunyuanWarmupPromise = fetch(HUNYUAN3D_URL, {
      method: "GET",
      signal: AbortSignal.timeout(8_000)
    })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return hunyuanWarmupPromise;
}

export type GeneratorAttempt = { provider: string; ok: boolean; error?: string };

async function generateViaHunyuan3D(
  refUrl: string,
  brief: ThreeDBrief
): Promise<{ url: string | null; error: string | null }> {
  try {
    const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[HUNYUAN3D]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

async function generateViaTrellis(refUrl: string): Promise<{ url: string | null; error: string | null }> {
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[TRELLIS]", msg);
    return { url: null, error: msg.slice(0, 200) };
  }
}

async function runSpatialGenerator(
  brief: ThreeDBrief,
  groundingResult: ReferenceGroundingResult,
  userImageBase64?: string | null
): Promise<{ glbUrl: string; tier: GeneratedAsset["tier"]; attempts: GeneratorAttempt[] }> {
  const attempts: GeneratorAttempt[] = [];
  const primaryRef = groundingResult.referenceImages[0] ?? null;

  if (primaryRef) {
    const { url, error } = await generateViaHunyuan3D(primaryRef, brief);
    attempts.push({ provider: "hunyuan3d (pollinations ref)", ok: Boolean(url), error: error ?? undefined });
    if (url) return { glbUrl: url, tier: "hunyuan3d", attempts };
  }

  if (userImageBase64) {
    const { url, error } = await generateViaHunyuan3D(`data:image/jpeg;base64,${userImageBase64}`, brief);
    attempts.push({ provider: "hunyuan3d (user image)", ok: Boolean(url), error: error ?? undefined });
    if (url) return { glbUrl: url, tier: "hunyuan3d", attempts };
  }

  const trellisRef = primaryRef ?? (userImageBase64 ? `data:image/jpeg;base64,${userImageBase64}` : null);
  if (trellisRef) {
    const { url, error } = await generateViaTrellis(trellisRef);
    attempts.push({ provider: "trellis (fal)", ok: Boolean(url), error: error ?? undefined });
    if (url) return { glbUrl: url, tier: "trellis", attempts };
  }

  return {
    glbUrl: `/api/3d/placeholder?name=${encodeURIComponent(brief.primaryObject)}`,
    tier: "fallback",
    attempts
  };
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
  textureUrls: GeneratedAsset["textureUrls"]
): Promise<GeneratedAsset> {
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const exportUrls: GeneratedAsset["exportUrls"] = {};

  if (glbUrl && !glbUrl.includes("placeholder")) {
    exportUrls.glb = glbUrl;
    const enc = encodeURIComponent(glbUrl);
    exportUrls.obj = `/api/3d/convert?from=${enc}&to=obj`;
    exportUrls.usd = `/api/3d/convert?from=${enc}&to=usd`;
    exportUrls.stl = `/api/3d/convert?from=${enc}&to=stl`;
  } else {
    exportUrls.glb = glbUrl;
  }

  return {
    id,
    name: brief.primaryObject,
    glbUrl,
    tier,
    materialBrief: brief.materialBrief,
    textureUrls,
    exportUrls,
    scaleMeters: estimateScale(brief),
    isWatertight: tier !== "fallback"
  };
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────

export async function* runInterpretPipeline(
  body: InterpretRequestBody
): AsyncGenerator<PipelineEvent> {
  try {
    const brief = await runDirector(body);
    yield { type: "director", brief, log: `[DIRECTOR] ${brief.intent} → "${brief.primaryObject}" (${brief.useCase}, ${brief.polygonBudget} poly)` };

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

    const groundingResult = await runMultiViewSynthesizer(brief);
    yield { type: "grounding", result: groundingResult, log: `[GROUNDER] ${groundingResult.referenceImages.length} views ready via Pollinations.ai` };

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

      yield { type: "generating", log: `[GENERATOR] "${slot.name}" (${i + 1}/${slots.length}) via Hunyuan3D-2.5...`, progress: 0.1 + 0.6 * (i / slots.length) };

      const { glbUrl, tier, attempts } = await runSpatialGenerator(slotBrief, groundingResult, body.referenceImage?.base64 ?? null);
      for (const attempt of attempts) {
        if (!attempt.ok && attempt.error) {
          yield { type: "generating", log: `[GENERATOR ERROR] ${attempt.provider}: ${attempt.error}`, progress: 0.75 };
        }
      }
      yield { type: "generating", log: `[GENERATOR] Mesh ready (${tier}), texturing...`, progress: 0.8 };

      const textureUrls = await generatePBRTextures(slotBrief);
      const asset = await runPackager(slotBrief, glbUrl, tier, textureUrls);
      generatedAssets.push(asset);

      yield { type: "asset_ready", asset, log: `[READY] "${asset.name}" — ${asset.tier}, ${asset.scaleMeters}m, ${Object.keys(asset.exportUrls).join("/")}` };
    }

    const qa_log = [
      `[QA] ${generatedAssets.length} asset(s) generated.`,
      `[QA] Scale: 1 unit = 1 meter (Blender/UE5/Unity standard).`,
      ...(brief.needsLODChain ? ["[QA] LOD chain: /api/3d/lod?url={glbUrl}"] : []),
      ...(brief.needsPhysicsMetadata ? ["[QA] Physics metadata in USD export."] : []),
      `[QA] Pipeline: Director → Grounder(Pollinations) → Hunyuan3D-2.5 → PBR → Packager`
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
