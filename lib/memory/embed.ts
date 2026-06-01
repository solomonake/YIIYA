/**
 * Text embedding helper.
 * Uses Gemini's text-embedding-004 (768-dim, free tier).
 *   Docs: https://ai.google.dev/gemini-api/docs/embeddings
 */
import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export async function embedText(text: string): Promise<number[] | null> {
  const c = client();
  if (!c) return null;
  if (!text.trim()) return null;
  try {
    const result = await c.models.embedContent({
      model: process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004",
      contents: text.slice(0, 4000)
    });
    const embedding = result.embeddings?.[0]?.values;
    return embedding ?? null;
  } catch {
    return null;
  }
}
