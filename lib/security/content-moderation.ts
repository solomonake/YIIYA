/**
 * Image content moderation.
 *
 * Before any user-uploaded image is forwarded to TRELLIS.2, Tripo, or any
 * downstream generator, run it through a vision-safety classifier.
 *
 * Free path: Gemini Vision (gemini-2.5-flash, with image input).
 * Schema-locked JSON output keeps the verdict machine-parseable.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/vision
 */
import { GoogleGenAI } from "@google/genai";

export type ImageVerdict = {
  allow: boolean;
  severity: "ok" | "warn" | "block";
  categories: ReadonlyArray<ImageFlag>;
  reason: string | null;
};

export type ImageFlag =
  | "csam"
  | "nudity"
  | "violence"
  | "self_harm"
  | "weapon"
  | "drug"
  | "real_person_pii"
  | "hate_symbol";

const SCHEMA = {
  type: "object",
  properties: {
    is_safe: { type: "boolean" },
    flags: {
      type: "array",
      items: {
        type: "string",
        enum: ["csam", "nudity", "violence", "self_harm", "weapon", "drug", "real_person_pii", "hate_symbol"]
      }
    },
    reason: { type: "string" }
  },
  required: ["is_safe", "flags", "reason"],
  propertyOrdering: ["is_safe", "flags", "reason"]
} as const;

const HARD_BLOCK: ReadonlyArray<ImageFlag> = ["csam", "real_person_pii"];

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export async function moderateImage(
  imageBase64: string,
  mimeType: string,
  options: { timeoutMs?: number } = {}
): Promise<ImageVerdict> {
  const c = client();
  // No moderator configured — fail closed for safety.
  if (!c) return { allow: false, severity: "block", categories: [], reason: "moderator_unconfigured" };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), options.timeoutMs ?? 5000);
  try {
    const result = await c.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            {
              text:
                "Classify this image. Return strict JSON. Flag CSAM, nudity, violence, " +
                "self-harm, weapons, drugs, real-person PII (identifiable faces with no consent), " +
                "or hate symbols. Be precise; product photography and creative renders are OK."
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0,
        abortSignal: ac.signal
      }
    });
    const raw = result.text;
    if (!raw) return { allow: false, severity: "block", categories: [], reason: "moderator_empty" };
    const parsed = JSON.parse(raw) as { is_safe: boolean; flags: ImageFlag[]; reason: string };
    if (parsed.is_safe) {
      return { allow: true, severity: "ok", categories: [], reason: null };
    }
    const block = parsed.flags.some((f) => HARD_BLOCK.includes(f));
    return {
      allow: !block,
      severity: block ? "block" : "warn",
      categories: parsed.flags,
      reason: parsed.reason
    };
  } catch (err) {
    return {
      allow: false,
      severity: "block",
      categories: [],
      reason: `moderator_error: ${err instanceof Error ? err.message : "unknown"}`
    };
  } finally {
    clearTimeout(timer);
  }
}
