/**
 * Alt-text generator.
 *
 * For every image in the rendered output that arrived without alt text, call
 * Gemini Vision to describe it in <=120 chars. Batched and cached against the
 * image URL hash to amortise cost.
 *
 * The a11y-guard reports `missing-alt` issues; this module produces the fix.
 */
import { GoogleGenAI } from "@google/genai";

const SCHEMA = {
  type: "object",
  properties: { alt: { type: "string" } },
  required: ["alt"]
} as const;

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

const cache = new Map<string, string>();

/**
 * Generate alt text for a remote image. Returns null on failure (callers
 * should leave the existing alt unchanged rather than ship garbage).
 */
export async function generateAltText(imageUrl: string, hint?: string): Promise<string | null> {
  if (cache.has(imageUrl)) return cache.get(imageUrl)!;
  const c = client();
  if (!c) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");

    const result = await c.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: base64, mimeType: mime } },
            {
              text:
                `Write alt text for this image in ≤120 characters. ` +
                `Describe what is shown, not how it looks. No "image of", no "picture of". ` +
                (hint ? `Context: ${hint.slice(0, 200)}.\n` : "") +
                `Return strict JSON: { "alt": string }.`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0.2
      }
    });
    const raw = result.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { alt: string };
    const alt = parsed.alt?.trim().slice(0, 120) || null;
    if (alt) cache.set(imageUrl, alt);
    return alt;
  } catch {
    return null;
  }
}

/**
 * Batch helper. Returns a Map<url, alt> for every URL we managed to caption.
 */
export async function generateAltBatch(urls: ReadonlyArray<{ url: string; hint?: string }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // Limit concurrency to 4 — Gemini free tier rate limits aggressively.
  const queue = [...urls];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      const alt = await generateAltText(next.url, next.hint);
      if (alt) out.set(next.url, alt);
    }
  });
  await Promise.all(workers);
  return out;
}
