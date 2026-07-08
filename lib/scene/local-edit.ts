/**
 * Local material-edit parser — the token-free, instant-edit fast path.
 *
 * A generated mesh is expensive (a full provider generation, ~1–5 min, real
 * money). But most follow-up edits a user asks for — "make it matte black",
 * "make it chrome", "a bit bigger" — don't need a new mesh at all: they're
 * material/scale changes we can apply to the *existing* GLB in-browser with
 * three.js, for free, in under a frame.
 *
 * This module is the classifier. Given a phrase, it returns a MaterialOverride
 * patch when the edit is one we can do locally, or `null` when the edit is
 * structural ("add a convertible top", "make it lowpoly") and must fall through
 * to the real generation pipeline.
 *
 * Deliberately deterministic and dependency-free (no model call, no React) so
 * it runs client-side instantly and is trivially unit-testable.
 */

export type MaterialOverride = {
  /** Hex base color, e.g. "#0a0a0a". Also clears vertexColors so it takes effect. */
  color?: string;
  /** 0 (dielectric) … 1 (metal). */
  metalness?: number;
  /** 0 (mirror) … 1 (fully diffuse). */
  roughness?: number;
  /** Hex emissive color for glow/neon looks. */
  emissive?: string;
  emissiveIntensity?: number;
  /** 0 (invisible) … 1 (opaque). <0.99 flips transparent on. */
  opacity?: number;
  /** Absolute display-scale multiplier applied on top of auto-framing. */
  scale?: number;
};

export type LocalEditResult = {
  patch: MaterialOverride;
  /** Relative scale change to fold into the existing override (e.g. 1.25 = 25% bigger). */
  scaleFactor?: number;
  /** Human-readable summary for the log line. */
  label: string;
};

// Named colors → hex. Kept small and unsurprising; unknown color words simply
// don't match and the phrase falls through to the pipeline.
const COLORS: Record<string, string> = {
  black: "#0a0a0a",
  white: "#f5f5f5",
  gray: "#808080",
  grey: "#808080",
  silver: "#c8ccd0",
  red: "#c0202a",
  crimson: "#a01824",
  green: "#1f8a3b",
  lime: "#7ed957",
  blue: "#2554c7",
  navy: "#16244a",
  cyan: "#22c7d0",
  teal: "#1f8a8a",
  yellow: "#e6c229",
  orange: "#e8791f",
  purple: "#7a2fb0",
  violet: "#7a2fb0",
  magenta: "#c72586",
  pink: "#e86fa5",
  brown: "#6b4423",
  tan: "#c9a87a",
  beige: "#d8caa8",
  gold: "#d4af37",
  bronze: "#8c6a3d",
  copper: "#b06b3a"
};

// Finish keywords → the PBR params that read as that finish.
const FINISHES: Array<{ re: RegExp; patch: MaterialOverride; name: string }> = [
  { re: /\b(matte|flat|dull|unfinished)\b/, patch: { roughness: 0.92, metalness: 0 }, name: "matte" },
  { re: /\b(glossy|gloss|shiny|shiney|polished|slick)\b/, patch: { roughness: 0.12, metalness: 0.1 }, name: "glossy" },
  { re: /\b(chrome|mirror|mirrored)\b/, patch: { metalness: 1, roughness: 0.05, color: "#c8ccd0" }, name: "chrome" },
  // Rusted must precede the generic metallic rule — "rusted metal" contains
  // "metal" and would otherwise read as clean chrome-ish steel.
  { re: /\b(rusted|rusty|rust|weathered|worn)\b/, patch: { metalness: 0.7, roughness: 0.85, color: "#8a5a3c" }, name: "rusted metal" },
  { re: /\b(metallic|metal|steel|iron|aluminium|aluminum)\b/, patch: { metalness: 1, roughness: 0.28 }, name: "metallic" },
  { re: /\b(plastic)\b/, patch: { metalness: 0, roughness: 0.5 }, name: "plastic" },
  { re: /\b(rubber|matte black rubber)\b/, patch: { metalness: 0, roughness: 0.95 }, name: "rubber" },
  { re: /\b(ceramic|porcelain)\b/, patch: { metalness: 0, roughness: 0.3 }, name: "ceramic" },
  { re: /\b(glass|transparent|see.through|clear)\b/, patch: { opacity: 0.35, roughness: 0.05, metalness: 0 }, name: "glass" }
];

// Structural edits genuinely need a new mesh — never intercept these.
const STRUCTURAL =
  /\b(add|remove|delete|attach|extend|convertible|top|roof|wheel|wheels|door|window|stripe|stripes|spoiler|wing|lowpoly|low.poly|highpoly|high.poly|more detail|less detail|smoother|rig|rigged|animate|pose|hollow|split|combine|merge|duplicate)\b/;

// Edit-shaped opener: distinguishes "make it red" (edit the active mesh) from
// "a red car" (a brand-new object that must go to the pipeline).
const EDIT_OPENER =
  /^\s*(make|turn|paint|recolou?r|colou?r|give it|it'?s|its|render it|now)\b/;

/**
 * Parse a phrase into a local material edit, or return null to route it to the
 * full generation pipeline.
 */
export function parseLocalEdit(phrase: string): LocalEditResult | null {
  const text = phrase.toLowerCase().trim();
  if (!text) return null;

  // Structural work always regenerates.
  if (STRUCTURAL.test(text)) return null;

  const patch: MaterialOverride = {};
  const parts: string[] = [];

  // Finish (first match wins — they're ordered specific → general).
  for (const f of FINISHES) {
    if (f.re.test(text)) {
      Object.assign(patch, f.patch);
      parts.push(f.name);
      break;
    }
  }

  // Color — a finish may have set one (chrome/gold/rust); an explicit color word
  // overrides it.
  for (const word of Object.keys(COLORS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      patch.color = COLORS[word];
      // gold/bronze/copper/silver read as metals even without a finish word.
      if (["gold", "bronze", "copper", "silver"].includes(word) && patch.metalness === undefined) {
        patch.metalness = 0.9;
        patch.roughness = patch.roughness ?? 0.35;
      }
      parts.push(word);
      break;
    }
  }

  // Emissive glow.
  if (/\b(glow|glowing|neon|emissive|luminous|lit up|light up)\b/.test(text)) {
    patch.emissive = patch.color ?? "#ffffff";
    patch.emissiveIntensity = 1.4;
    parts.push("glowing");
  }

  // Relative scale.
  let scaleFactor: number | undefined;
  if (/\b(bigger|larger|scale up|grow|enlarge)\b/.test(text)) {
    scaleFactor = /\b(much|way|lot)\b/.test(text) ? 1.6 : 1.25;
    parts.push("bigger");
  } else if (/\b(smaller|tinier|shrink|scale down)\b/.test(text)) {
    scaleFactor = /\b(much|way|lot)\b/.test(text) ? 0.55 : 0.8;
    parts.push("smaller");
  }

  const hasMaterial = Object.keys(patch).length > 0;
  const hasScale = scaleFactor !== undefined;
  if (!hasMaterial && !hasScale) return null;

  // Guard against catching new-object prompts that merely contain a color word
  // ("a red sports car"). Require an edit-shaped opener UNLESS the phrase is a
  // terse pure material/scale phrase (≤2 words, no leading article), which is
  // what chips and clipped voice edits ("matte black", "chrome") produce.
  const wordCount = text.split(/\s+/).length;
  const startsWithArticle = /^\s*(a|an|the)\b/.test(text);
  if (!EDIT_OPENER.test(text) && (wordCount > 2 || startsWithArticle)) return null;

  return {
    patch,
    scaleFactor,
    label: parts.length ? parts.join(" ") : "material tweak"
  };
}
