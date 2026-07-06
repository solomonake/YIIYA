/**
 * Text → 3D, the "say cup, get cup" pipeline.
 *
 * Behaviour:
 *
 *   1. If the prompt matches a noun in the static GLB library (Tier 0),
 *      return it immediately (~50ms).
 *
 *   2. Otherwise:
 *        - intent='preview' → call Tripo (fastest text→3D).
 *        - intent='final'   → text → studio-product-image → TRELLIS.2 (best PBR).
 *
 * Image-first generation for 'final' beats pure text→3D models because
 * image generators have universal noun vocabulary. The text→3D pipeline
 * is otherwise spotty on niche objects.
 *
 * Image model: Gemini's image generation surface (https://ai.google.dev/gemini-api/docs/image-generation).
 * If unavailable, the function falls back to direct Tripo text→3D.
 */
import { GoogleGenAI } from "@google/genai";
import { generate3d } from "./providers/router";
import type { GenerationRequest, GenerationResult } from "./providers/types";
import { classifyPromptSubject, objectGenerationPrompt } from "@/lib/scene/prompt-intent";

export type TextTo3dRequest = {
  prompt: string;
  intent: "preview" | "final";
  userId?: string | null;
  sessionId?: string | null;
  traceId?: string | null;
};

export type TextTo3dResult =
  | { ok: true; tier: "library" | "tripo" | "image-first-trellis2"; result: GenerationResult }
  | { ok: false; reason: string; attempts: unknown };

const LIBRARY_NOUNS = new Set([
  "cup", "mug", "bottle", "vase", "chair", "lamp", "candle", "book",
  "phone", "laptop", "watch", "shoe", "bag", "plant", "pot", "frame",
  "car", "vehicle", "truck", "sedan", "suv"
]);

const STATIC_LIBRARY_BASE = "/static-3d-library";

let _genai: GoogleGenAI | null = null;
function genai(): GoogleGenAI | null {
  if (_genai) return _genai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _genai = new GoogleGenAI({ apiKey });
  return _genai;
}

export async function textTo3d(req: TextTo3dRequest): Promise<TextTo3dResult> {
  const classifiedPrompt = classifyPromptSubject(req.prompt);
  const providerPrompt = classifiedPrompt.generationPrompt;

  // Tier 0 — static library hit (no network).
  const noun = classifiedPrompt.kind === "object" ? pickLibraryNoun(classifiedPrompt.subject) : null;
  if (noun) {
    return {
      ok: true,
      tier: "library",
      result: {
        provider: "trellis2-hf",
        glbUrl: `${STATIC_LIBRARY_BASE}/${noun}.glb`,
        latencyMs: 0,
        cost: { provider: "trellis2-hf", usd: 0 },
        meta: { source: "static-library", noun }
      }
    };
  }

  // Tier 1 — fast preview via Tripo direct text-to-3D.
  if (req.intent === "preview") {
    const outcome = await generate3d({
      kind: "text-to-3d",
      prompt: providerPrompt,
      intent: "preview",
      pbr: true,
      userId: req.userId,
      sessionId: req.sessionId,
      traceId: req.traceId,
      budgetMs: 30_000
    });
    if (outcome.ok) return { ok: true, tier: "tripo", result: outcome.result };
    return { ok: false, reason: "all_providers_failed", attempts: outcome.attempts };
  }

  // Tier 2 — final: text → studio image → TRELLIS.2 (PBR).
  const imageBase64 = await synthesizeStudioImage(req.prompt);
  if (imageBase64) {
    const baseReq: GenerationRequest = {
      kind: "image-to-3d",
      imageBase64,
      imageMime: "image/png",
      intent: "final",
      pbr: true,
      transparency: detectTransparency(req.prompt),
      userId: req.userId,
      sessionId: req.sessionId,
      traceId: req.traceId,
      budgetMs: 120_000
    };
    const outcome = await generate3d(baseReq);
    if (outcome.ok) return { ok: true, tier: "image-first-trellis2", result: outcome.result };
  }

  // Final fallback — direct Tripo text-to-3D.
  const outcome = await generate3d({
    kind: "text-to-3d",
    prompt: providerPrompt,
    intent: "final",
    pbr: true,
    userId: req.userId,
    sessionId: req.sessionId,
    traceId: req.traceId,
    budgetMs: 60_000
  });
  if (outcome.ok) return { ok: true, tier: "tripo", result: outcome.result };
  return { ok: false, reason: "all_providers_failed", attempts: outcome.attempts };
}

function pickLibraryNoun(prompt: string): string | null {
  const tokens = prompt.toLowerCase().split(/\W+/).filter(Boolean);
  for (const t of tokens) {
    if (["vehicle", "truck", "sedan", "suv"].includes(t)) return "car";
    if (LIBRARY_NOUNS.has(t)) return t;
  }
  return null;
}

function detectTransparency(prompt: string): boolean {
  return /\b(glass|clear|crystal|transparent|translucent|water|ice)\b/i.test(prompt);
}

async function synthesizeStudioImage(prompt: string): Promise<string | null> {
  const c = genai();
  if (!c) return null;
  const imagePrompt = objectGenerationPrompt(prompt);
  try {
    const result = await c.models.generateContent({
      // Image-capable Gemini model — see https://ai.google.dev/gemini-api/docs/image-generation
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `Studio product photo of: ${imagePrompt}. ` +
                "Pure white seamless background. Soft top-down studio lighting. " +
                "Single isolated subject, centered, no shadows on the floor. " +
                "Photorealistic, sharp focus, no text, no logo."
            }
          ]
        }
      ]
    });
    const parts = result.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const data = (part as { inlineData?: { data?: string } }).inlineData;
      if (data?.data) return data.data;
    }
    return null;
  } catch {
    return null;
  }
}
