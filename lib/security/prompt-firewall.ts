/**
 * Prompt firewall.
 *
 * Two layers:
 *   1. Cheap deterministic regex pass — catches the obvious 80%.
 *   2. Gemini-flash classifier — catches the rest, with structured output.
 *
 * Used by every route that forwards user transcripts to an LLM.
 * Returns a verdict + reason; callers decide whether to block, warn, or scrub.
 *
 * Reference research:
 *   - OWASP LLM01: Prompt Injection — https://genai.owasp.org/llmrisk/llm01-prompt-injection/
 *   - Gemini structured output — https://ai.google.dev/gemini-api/docs/structured-output
 */
import { GoogleGenAI } from "@google/genai";

export type FirewallVerdict = {
  allow: boolean;
  severity: "ok" | "warn" | "block";
  reason: string | null;
  categories: ReadonlyArray<FirewallCategory>;
  sanitized: string;
};

export type FirewallCategory =
  | "prompt_injection"
  | "system_extraction"
  | "self_harm"
  | "sexual_minors"
  | "violent_extremism"
  | "csam"
  | "malware"
  | "pii_exfil";

// -----------------------------------------------------------------------------
// Layer 1 — deterministic regex pass
// -----------------------------------------------------------------------------

const JAILBREAK_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore (?:all |previous |your )?(?:prior )?(?:instructions|prompts|rules)/i,
  /you are (?:now |actually )(?:DAN|jailbroken|unrestricted|in developer mode)/i,
  /(?:reveal|show|print|return|output|leak) (?:your |the |system )?(?:prompt|instructions|rules)/i,
  /act as if (?:you have no |you don'?t have any )(?:restrictions|rules|guidelines)/i,
  /pretend (?:you are |to be )(?:an? )?(?:evil|unrestricted|jailbroken)/i,
  /<\|im_start\|>|<\|im_end\|>|\[SYSTEM\]|\[\/SYSTEM\]/i,
  /\bsudo (?:mode|access|root)\b/i,
  /developer mode (?:on|enabled|activated)/i
];

const PII_LEAK_PATTERNS: ReadonlyArray<RegExp> = [
  /(?:my|the user'?s) (?:ssn|social security|credit card|cvv) (?:is |number )/i,
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN format
  /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13})\b/ // Visa / MasterCard / Amex PANs
];

const CSAM_KEYWORDS: ReadonlyArray<RegExp> = [
  // Deliberately conservative; LLM layer catches subtler phrasing.
  /\b(?:child|minor|underage|teen)\s+(?:porn|nude|naked|sexual)/i,
  /\b(?:lolicon|shotacon|cp)\b/i
];

// Strip zero-width / control characters used to hide injections.
const HOMOGLYPH_ZWS = /[​-‏‪-‮⁠-⁯﻿]/g;

function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .replace(HOMOGLYPH_ZWS, "")
    .replace(/\r\n/g, "\n")
    .slice(0, 8000); // hard cap; anything longer is suspicious
}

function regexPass(input: string): FirewallVerdict | null {
  const text = input.toLowerCase();
  for (const re of CSAM_KEYWORDS) {
    if (re.test(text)) {
      return {
        allow: false,
        severity: "block",
        reason: "Content flagged for prohibited category.",
        categories: ["csam"],
        sanitized: ""
      };
    }
  }
  for (const re of JAILBREAK_PATTERNS) {
    if (re.test(text)) {
      return {
        allow: false,
        severity: "block",
        reason: "Detected prompt-injection pattern.",
        categories: ["prompt_injection"],
        sanitized: input.replace(re, "[removed]")
      };
    }
  }
  for (const re of PII_LEAK_PATTERNS) {
    if (re.test(input)) {
      return {
        allow: true,
        severity: "warn",
        reason: "PII pattern detected; scrubbed before forwarding.",
        categories: ["pii_exfil"],
        sanitized: input.replace(re, "[redacted]")
      };
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Layer 2 — Gemini classifier
// -----------------------------------------------------------------------------

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    is_safe: { type: "boolean" },
    confidence: { type: "number" },
    categories: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "prompt_injection",
          "system_extraction",
          "self_harm",
          "sexual_minors",
          "violent_extremism",
          "csam",
          "malware",
          "pii_exfil"
        ]
      }
    },
    short_reason: { type: "string" }
  },
  required: ["is_safe", "confidence", "categories", "short_reason"],
  propertyOrdering: ["is_safe", "confidence", "categories", "short_reason"]
} as const;

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

async function llmClassify(input: string, timeoutMs: number): Promise<FirewallVerdict> {
  const c = client();
  // If the LLM is unavailable, fail open with WARN — never block on infra.
  if (!c) return { allow: true, severity: "ok", reason: null, categories: [], sanitized: input };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const result = await c.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "You are a safety classifier for a creative web/3D building tool. " +
                "Classify the following user input. Return strict JSON matching the schema. " +
                "Be precise: only flag content that is clearly unsafe. Edgy creative briefs are OK.\n\n" +
                `INPUT:\n"""\n${input}\n"""`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
        abortSignal: ac.signal
      }
    });
    const raw = result.text;
    if (!raw) return { allow: true, severity: "warn", reason: "classifier_empty", categories: [], sanitized: input };
    const parsed = JSON.parse(raw) as {
      is_safe: boolean;
      confidence: number;
      categories: FirewallCategory[];
      short_reason: string;
    };
    if (parsed.is_safe || parsed.confidence < 0.6) {
      return { allow: true, severity: "ok", reason: null, categories: [], sanitized: input };
    }
    const block = parsed.categories.some((c) =>
      ["csam", "sexual_minors", "violent_extremism", "malware"].includes(c)
    );
    return {
      allow: !block,
      severity: block ? "block" : "warn",
      reason: parsed.short_reason,
      categories: parsed.categories,
      sanitized: input
    };
  } catch {
    return { allow: true, severity: "warn", reason: "classifier_unavailable", categories: [], sanitized: input };
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Public entry
// -----------------------------------------------------------------------------

export async function inspectPrompt(
  raw: string,
  options: { skipLlm?: boolean; timeoutMs?: number } = {}
): Promise<FirewallVerdict> {
  const normalized = normalize(raw);
  if (!normalized.trim()) {
    return { allow: false, severity: "block", reason: "empty input", categories: [], sanitized: "" };
  }
  const regex = regexPass(normalized);
  if (regex && (regex.severity === "block" || options.skipLlm)) return regex;

  const llm = await llmClassify(regex?.sanitized ?? normalized, options.timeoutMs ?? 3000);
  if (regex?.severity === "warn") {
    return {
      ...llm,
      severity: llm.severity === "block" ? "block" : "warn",
      reason: [regex.reason, llm.reason].filter(Boolean).join("; "),
      categories: Array.from(new Set([...regex.categories, ...llm.categories])),
      sanitized: regex.sanitized
    };
  }
  return llm;
}
