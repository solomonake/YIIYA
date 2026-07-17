/**
 * Output sanitization.
 *
 * Strips HTML tags and dangerous URL schemes from Architect output strings
 * before they're rendered or stored. No DOM dependency — safe in Edge, Node,
 * and serverless environments.
 */

const TAG_RE = /<\/?[^>]+(>|$)/g;

const INLINE_TAGS = new Set(["b", "i", "em", "strong", "br", "span"]);
const INLINE_RE = /<\/?(b|i|em|strong|br|span)\s*\/?>/gi;

export function sanitizeInline(html: string): string {
  if (!html) return "";
  return html.replace(TAG_RE, (match) => {
    const tagMatch = match.match(/^<\/?(\w+)/);
    if (tagMatch && INLINE_TAGS.has(tagMatch[1].toLowerCase())) return match;
    return "";
  }).trim();
}

export function sanitizePlain(text: string): string {
  if (!text) return "";
  return text.replace(TAG_RE, "").replace(/\s+/g, " ").trim();
}

const SAFE_URL_RE = /^(https?:|mailto:|tel:|\/|#)/i;

export function sanitizeUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!SAFE_URL_RE.test(trimmed)) return null;
  if (/@/.test(trimmed) && !trimmed.startsWith("mailto:")) return null;
  return trimmed;
}

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
