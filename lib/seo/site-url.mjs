/**
 * Public origin for sitemap, robots, canonical, and Open Graph URLs.
 * Override with NEXT_PUBLIC_SITE_URL when the site moves to another domain.
 */
export const DEFAULT_SITE_URL = "https://yiiya.vercel.app";

/**
 * Pages a crawler should list. Each one is a real route:
 * `/` and `/app` are App Router pages, and the photo routes are rewrites to
 * files in public/photo-lab. /gallery and /p/[slug] are not routes.
 *
 * @type {Array<{ path: string, changeFrequency: "weekly" | "monthly", priority: number, document?: string }>}
 */
export const indexablePages = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/app", changeFrequency: "weekly", priority: 0.9 },
  {
    path: "/photo-studio",
    changeFrequency: "weekly",
    priority: 0.8,
    document: "public/photo-lab/index.html"
  },
  {
    path: "/photo-studio/mug",
    changeFrequency: "monthly",
    priority: 0.6,
    document: "public/photo-lab/mug-builder.html"
  },
  {
    path: "/research/mug",
    changeFrequency: "monthly",
    priority: 0.4,
    document: "public/photo-lab/mug/index.html"
  }
];

export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_URL;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_SITE_URL;
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Absolute URL for a site path. The homepage has no trailing slash. */
export function absoluteUrl(pathname = "/") {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path === "/" ? siteUrl() : `${siteUrl()}${path}`;
}

function escapeHtmlAttr(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

const CANONICAL_TAGS =
  /<link rel="canonical" href="[^"]*"><meta property="og:url" content="[^"]*">/;

/** Insert or replace the canonical link and og:url pair in a static document. */
export function upsertCanonicalTags(html, canonical) {
  const tags = `<link rel="canonical" href="${escapeHtmlAttr(canonical)}"><meta property="og:url" content="${escapeHtmlAttr(canonical)}">`;
  if (CANONICAL_TAGS.test(html)) return html.replace(CANONICAL_TAGS, tags);
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tags}</head>`);
  return `${tags}${html}`;
}
