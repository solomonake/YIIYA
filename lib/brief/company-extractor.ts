/**
 * Company / brand name extraction.
 *
 * The Architect was previously emitting "A company for…" placeholders because
 * the CreativeBrief schema had no companyName field. This module is the
 * cheap deterministic pass; a Gemini structured-extraction fallback handles
 * the rest.
 *
 * Strategy:
 *   1. Run a battery of high-precision regex patterns against the raw transcript.
 *   2. If still null, call extractWithLlm() — schema-locked Gemini call.
 *
 * Renderers should treat companyName === null as "show the curiosity-hook
 * placeholder" — never as license to emit slop like "A company in Atlanta."
 */
import { GoogleGenAI } from "@google/genai";

export type BrandExtraction = {
  companyName: string | null;
  industry: string | null;
  oneLiner: string | null;
  vibeKeywords: ReadonlyArray<string>;
  confidence: number;
};

// -----------------------------------------------------------------------------
// Deterministic pass
// -----------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "my", "your", "our", "this", "that",
  "company", "brand", "studio", "agency", "site", "website",
  "shop", "store", "platform", "app", "saas", "service"
]);

const NAMED_PATTERNS: ReadonlyArray<RegExp> = [
  /\bcalled\s+["']?([A-Z][\w&'.\- ]{1,40}?)["']?(?:\.|,|$|\s+(?:that|which|where|with|for|to))/,
  /\bnamed\s+["']?([A-Z][\w&'.\- ]{1,40}?)["']?(?:\.|,|$|\s+(?:that|which))/,
  /\b(?:brand|company|studio|agency|site|business)\s+(?:is\s+)?["']?([A-Z][\w&'.\- ]{1,40}?)["']?(?:\.|,|$|\s+(?:that|which))/,
  /\bfor\s+([A-Z][\w&'.\-]+(?:\s+[A-Z][\w&'.\-]+){0,3})(?:\s+(?:that|which|where|in)|[.,]|$)/,
  /\b([A-Z][\w&'.\-]+(?:\s+[A-Z][\w&'.\-]+){0,3})\s+(?:website|site|brand|company|studio|agency)\b/
];

const INDUSTRY_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:plumbing|plumber)\b/i, "home services"],
  [/\b(?:law|lawyer|attorney|legal)\b/i, "legal services"],
  [/\b(?:dental|dentist)\b/i, "healthcare"],
  [/\b(?:salon|haircut|barber|spa)\b/i, "beauty & wellness"],
  [/\b(?:restaurant|cafe|bar|bistro|eatery)\b/i, "food & beverage"],
  [/\b(?:portfolio|artist|photographer|designer|illustrator)\b/i, "creative portfolio"],
  [/\b(?:saas|platform|software|api|developer)\b/i, "software"],
  [/\b(?:fashion|clothing|apparel|streetwear)\b/i, "fashion"],
  [/\b(?:watch|jewelry|jewellery|luxury|premium)\b/i, "luxury goods"],
  [/\b(?:fitness|gym|wellness|yoga)\b/i, "fitness"],
  [/\b(?:coffee|roastery|tea)\b/i, "food & beverage"],
  [/\b(?:agency|studio)\b/i, "creative agency"]
];

const VIBE_HINTS = /\b(luxury|premium|editorial|brutalist|playful|viral|minimal|maximal|warm|cold|monochrome|cinematic|kinetic)\b/gi;

function cleanName(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/["'.,]/g, "").trim();
  if (!t) return null;
  if (STOPWORDS.has(t.toLowerCase())) return null;
  if (/^(Build|Make|Create|Design|Add|Show|Give|Generate)/i.test(t)) return null;
  return t.slice(0, 60);
}

export function extractDeterministic(transcript: string): BrandExtraction {
  let companyName: string | null = null;
  for (const re of NAMED_PATTERNS) {
    const m = transcript.match(re);
    const candidate = cleanName(m?.[1]);
    if (candidate) {
      companyName = candidate;
      break;
    }
  }

  let industry: string | null = null;
  for (const [re, label] of INDUSTRY_HINTS) {
    if (re.test(transcript)) {
      industry = label;
      break;
    }
  }

  const vibeKeywords = Array.from(
    new Set((transcript.match(VIBE_HINTS) ?? []).map((v) => v.toLowerCase()))
  );

  const confidence =
    (companyName ? 0.6 : 0) + (industry ? 0.2 : 0) + Math.min(vibeKeywords.length, 4) * 0.05;

  return {
    companyName,
    industry,
    oneLiner: null,
    vibeKeywords,
    confidence: Math.min(confidence, 0.95)
  };
}

// -----------------------------------------------------------------------------
// LLM pass — only invoked if confidence < 0.5
// -----------------------------------------------------------------------------

const SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: "string", nullable: true },
    industry: { type: "string", nullable: true },
    one_liner: { type: "string", nullable: true },
    vibe_keywords: { type: "array", items: { type: "string" } }
  },
  required: ["vibe_keywords"],
  propertyOrdering: ["company_name", "industry", "one_liner", "vibe_keywords"]
} as const;

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export async function extractWithLlm(transcript: string, timeoutMs = 4000): Promise<BrandExtraction> {
  const c = client();
  if (!c) return extractDeterministic(transcript);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const result = await c.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Extract structured brand info from this short user transcript. " +
                "Return strict JSON. If a field is unknown, return null (do not invent).\n\n" +
                `TRANSCRIPT: """${transcript.slice(0, 2000)}"""`
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
    if (!raw) return extractDeterministic(transcript);
    const parsed = JSON.parse(raw) as {
      company_name: string | null;
      industry: string | null;
      one_liner: string | null;
      vibe_keywords: string[];
    };
    return {
      companyName: parsed.company_name ?? null,
      industry: parsed.industry ?? null,
      oneLiner: parsed.one_liner ?? null,
      vibeKeywords: parsed.vibe_keywords ?? [],
      confidence: parsed.company_name ? 0.85 : 0.4
    };
  } catch {
    return extractDeterministic(transcript);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Single entry point. Deterministic first; LLM only if needed.
 */
export async function extractBrand(transcript: string): Promise<BrandExtraction> {
  const fast = extractDeterministic(transcript);
  if (fast.confidence >= 0.5) return fast;
  return extractWithLlm(transcript);
}

/**
 * Curiosity-hook placeholder for renderers when companyName === null.
 * NEVER returns "A company for…" — always returns an editable affordance hint.
 */
export function namePlaceholder(slot: "hero-title" | "logo" | "about" | "footer"): string {
  switch (slot) {
    case "hero-title":
      return "[ name your studio ]";
    case "logo":
      return "[ logo ]";
    case "about":
      return "[ tell us who you are ]";
    case "footer":
      return "[ studio name ]";
  }
}
