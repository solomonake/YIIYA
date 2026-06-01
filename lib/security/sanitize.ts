/**
 * Output sanitization.
 *
 * The Architect emits structured JSON, but any string field that ends up
 * rendered into the DOM (headlines, body copy, etc.) must be sanitized:
 *   - strip <script>, <iframe>, event handlers
 *   - strip javascript:/data: URLs in href fields
 *   - keep a tiny allowlist of inline tags users might want (em, strong, br)
 *
 * Powered by isomorphic-dompurify — works in Edge + Node + browser.
 * https://github.com/kkomelin/isomorphic-dompurify
 */
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = ["b", "i", "em", "strong", "br", "span"];
const ALLOWED_ATTR: string[] = []; // no attributes — pure inline formatting

export function sanitizeInline(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false
  });
}

export function sanitizePlain(text: string): string {
  if (!text) return "";
  // Strip all HTML; collapse whitespace.
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\s+/g, " ")
    .trim();
}

const SAFE_URL_RE = /^(https?:|mailto:|tel:|\/|#)/i;

export function sanitizeUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!SAFE_URL_RE.test(trimmed)) return null;
  // Disallow embedded credentials.
  if (/@/.test(trimmed) && !trimmed.startsWith("mailto:")) return null;
  return trimmed;
}

/**
 * Recursively sanitize all string fields in an object. Use after parsing
 * Architect output, before storing or rendering.
 */
export function sanitizePayload<T>(input: T, urlKeys: ReadonlyArray<string> = []): T {
  return walk(input, urlKeys) as T;
}

function walk(value: unknown, urlKeys: ReadonlyArray<string>, key?: string): unknown {
  if (typeof value === "string") {
    if (key && urlKeys.includes(key)) return sanitizeUrl(value);
    return sanitizePlain(value);
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, urlKeys));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, urlKeys, k);
    return out;
  }
  return value;
}
