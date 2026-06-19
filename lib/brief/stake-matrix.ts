// @ts-nocheck
/**
 * Planted-stake matrix.
 *
 * Replaces the previous 5-palette enum in lib/creative-brief.ts. Every build
 * lands at one cell of a 6 × 8 × 4 = 192-cell matrix and is locked there for
 * the duration of the session. Critic refuses any action that contradicts
 * the locked stake.
 *
 * Dimensions:
 *   typographyVoice  — what fonts feel like (6)
 *   colorStory       — how palettes are organised (8)
 *   motionPersonality — what motion expresses (4)
 *
 * Each typography voice maps to free, self-hostable fonts via @fontsource.
 * No purple→blue gradients. No Inter as default.
 */

export type TypographyVoice =
  | "editorial-serif"
  | "mono-terminal"
  | "humanist-sans"
  | "display-experimental"
  | "swiss-grotesk"
  | "hand-drawn";

export type ColorStory =
  | "monochrome"
  | "duotone"
  | "limited-3"
  | "high-contrast-pair"
  | "warm-neutral"
  | "cold-clinical"
  | "editorial-cream"
  | "midnight";

export type MotionPersonality = "still" | "considered" | "kinetic" | "reactive";

export type Stake = {
  typographyVoice: TypographyVoice;
  colorStory: ColorStory;
  motionPersonality: MotionPersonality;
};

// -----------------------------------------------------------------------------
// Typography pairings (heading / body / mono). Free fonts via Fontsource.
//   Index: https://fontsource.org/
// -----------------------------------------------------------------------------
export const TYPOGRAPHY: Record<
  TypographyVoice,
  {
    heading: { family: string; weight: number; package: string; url: string };
    body: { family: string; weight: number; package: string; url: string };
    mono: { family: string; weight: number; package: string; url: string };
  }
> = {
  "editorial-serif": {
    heading: {
      family: "Fraunces",
      weight: 700,
      package: "@fontsource-variable/fraunces",
      url: "https://fontsource.org/fonts/fraunces"
    },
    body: {
      family: "Newsreader",
      weight: 400,
      package: "@fontsource-variable/newsreader",
      url: "https://fontsource.org/fonts/newsreader"
    },
    mono: {
      family: "JetBrains Mono",
      weight: 400,
      package: "@fontsource/jetbrains-mono",
      url: "https://fontsource.org/fonts/jetbrains-mono"
    }
  },
  "mono-terminal": {
    heading: {
      family: "JetBrains Mono",
      weight: 700,
      package: "@fontsource/jetbrains-mono",
      url: "https://fontsource.org/fonts/jetbrains-mono"
    },
    body: {
      family: "JetBrains Mono",
      weight: 400,
      package: "@fontsource/jetbrains-mono",
      url: "https://fontsource.org/fonts/jetbrains-mono"
    },
    mono: {
      family: "JetBrains Mono",
      weight: 400,
      package: "@fontsource/jetbrains-mono",
      url: "https://fontsource.org/fonts/jetbrains-mono"
    }
  },
  "humanist-sans": {
    heading: {
      family: "Geist",
      weight: 700,
      package: "@fontsource-variable/geist",
      url: "https://fontsource.org/fonts/geist"
    },
    body: {
      family: "Geist",
      weight: 400,
      package: "@fontsource-variable/geist",
      url: "https://fontsource.org/fonts/geist"
    },
    mono: {
      family: "Geist Mono",
      weight: 400,
      package: "@fontsource-variable/geist-mono",
      url: "https://fontsource.org/fonts/geist-mono"
    }
  },
  "display-experimental": {
    heading: {
      // Big Shoulders Display — distinctive bold geometric, free on Fontsource.
      // Replaces Cabinet Grotesk (which is not redistributable via Fontsource).
      family: "Big Shoulders Display",
      weight: 800,
      package: "@fontsource/big-shoulders-display",
      url: "https://fontsource.org/fonts/big-shoulders-display"
    },
    body: {
      family: "Inter Tight",
      weight: 400,
      package: "@fontsource-variable/inter-tight",
      url: "https://fontsource.org/fonts/inter-tight"
    },
    mono: {
      family: "JetBrains Mono",
      weight: 400,
      package: "@fontsource/jetbrains-mono",
      url: "https://fontsource.org/fonts/jetbrains-mono"
    }
  },
  "swiss-grotesk": {
    heading: {
      family: "Space Grotesk",
      weight: 600,
      package: "@fontsource-variable/space-grotesk",
      url: "https://fontsource.org/fonts/space-grotesk"
    },
    body: {
      family: "Space Grotesk",
      weight: 400,
      package: "@fontsource-variable/space-grotesk",
      url: "https://fontsource.org/fonts/space-grotesk"
    },
    mono: {
      family: "Space Mono",
      weight: 400,
      package: "@fontsource/space-mono",
      url: "https://fontsource.org/fonts/space-mono"
    }
  },
  "hand-drawn": {
    heading: {
      family: "Caveat",
      weight: 700,
      package: "@fontsource-variable/caveat",
      url: "https://fontsource.org/fonts/caveat"
    },
    body: {
      family: "Patrick Hand",
      weight: 400,
      package: "@fontsource/patrick-hand",
      url: "https://fontsource.org/fonts/patrick-hand"
    },
    mono: {
      family: "JetBrains Mono",
      weight: 400,
      package: "@fontsource/jetbrains-mono",
      url: "https://fontsource.org/fonts/jetbrains-mono"
    }
  }
};

// -----------------------------------------------------------------------------
// Color stories. Each returns a small palette: [bg, fg, accent, muted, edge].
// Hard ban on purple→blue gradients enforced by SlopGuard, not here.
// -----------------------------------------------------------------------------
export const COLOR_STORIES: Record<ColorStory, { bg: string; fg: string; accent: string; muted: string; edge: string }> = {
  "monochrome": { bg: "#0A0A0A", fg: "#F2F2F2", accent: "#FFFFFF", muted: "#777777", edge: "#1F1F1F" },
  "duotone": { bg: "#0E1116", fg: "#F4F4F4", accent: "#E94B1F", muted: "#7A8290", edge: "#1A1F26" },
  "limited-3": { bg: "#0F0F0F", fg: "#EDEDED", accent: "#FFB100", muted: "#787878", edge: "#1E1E1E" },
  "high-contrast-pair": { bg: "#FFFFFF", fg: "#000000", accent: "#FF2D2D", muted: "#737373", edge: "#000000" },
  "warm-neutral": { bg: "#F4EFE6", fg: "#1A0F0A", accent: "#C45433", muted: "#7C6F60", edge: "#2A1F18" },
  "cold-clinical": { bg: "#F7F9FB", fg: "#0B1320", accent: "#1F7AE0", muted: "#6E7B8B", edge: "#1B2638" },
  "editorial-cream": { bg: "#F2EEE7", fg: "#1A1813", accent: "#A88248", muted: "#7C7669", edge: "#2A271E" },
  "midnight": { bg: "#050810", fg: "#E6ECF4", accent: "#3BE1FF", muted: "#5B6577", edge: "#0F1320" }
};

// -----------------------------------------------------------------------------
// Motion personalities — concrete Framer-Motion-friendly recipes.
// -----------------------------------------------------------------------------
export const MOTION: Record<
  MotionPersonality,
  {
    entry: { y: number; opacity: number; duration: number };
    hover: { scale: number };
    scrollParallax: number;
  }
> = {
  still: { entry: { y: 0, opacity: 0, duration: 0 }, hover: { scale: 1 }, scrollParallax: 0 },
  considered: { entry: { y: 20, opacity: 0, duration: 0.5 }, hover: { scale: 1.02 }, scrollParallax: 0.05 },
  kinetic: { entry: { y: 40, opacity: 0, duration: 0.7 }, hover: { scale: 1.05 }, scrollParallax: 0.15 },
  reactive: { entry: { y: 30, opacity: 0, duration: 0.6 }, hover: { scale: 1.03 }, scrollParallax: 0.1 }
};

// -----------------------------------------------------------------------------
// Heuristic stake picker. The Architect can override.
// -----------------------------------------------------------------------------
export function pickStakeFromVibe(vibeKeywords: ReadonlyArray<string>, industry: string | null): Stake {
  const v = vibeKeywords.map((s) => s.toLowerCase());
  const has = (...words: string[]) => words.some((w) => v.includes(w));

  let typographyVoice: TypographyVoice = "humanist-sans";
  if (has("editorial", "luxury", "premium")) typographyVoice = "editorial-serif";
  else if (has("terminal", "developer", "code", "ai")) typographyVoice = "mono-terminal";
  else if (has("brutalist", "experimental", "viral")) typographyVoice = "display-experimental";
  else if (has("minimal", "swiss", "clean")) typographyVoice = "swiss-grotesk";
  else if (has("playful", "warm", "handmade")) typographyVoice = "hand-drawn";

  let colorStory: ColorStory = "midnight";
  if (has("luxury", "premium", "editorial")) colorStory = "editorial-cream";
  else if (has("warm", "warmth")) colorStory = "warm-neutral";
  else if (has("clinical", "minimal", "swiss")) colorStory = "cold-clinical";
  else if (has("monochrome", "mono")) colorStory = "monochrome";
  else if (has("playful", "viral", "kinetic")) colorStory = "duotone";

  let motionPersonality: MotionPersonality = "considered";
  if (has("still", "editorial", "swiss")) motionPersonality = "still";
  else if (has("kinetic", "viral", "playful", "energetic")) motionPersonality = "kinetic";
  else if (has("interactive", "experimental")) motionPersonality = "reactive";

  if (industry === "luxury goods") {
    typographyVoice = "editorial-serif";
    colorStory = "editorial-cream";
    motionPersonality = "still";
  } else if (industry === "software") {
    typographyVoice = "mono-terminal";
    colorStory = "midnight";
  }

  return { typographyVoice, colorStory, motionPersonality };
}

/**
 * Compile a stake into CSS custom properties + font import URLs.
 * The renderer injects these into the document <head>.
 */
export function compileStake(stake: Stake): {
  cssVars: Record<string, string>;
  fontPackages: ReadonlyArray<string>;
} {
  const typo = TYPOGRAPHY[stake.typographyVoice];
  const colors = COLOR_STORIES[stake.colorStory];
  return {
    cssVars: {
      "--yiiya-bg": colors.bg,
      "--yiiya-fg": colors.fg,
      "--yiiya-accent": colors.accent,
      "--yiiya-muted": colors.muted,
      "--yiiya-edge": colors.edge,
      "--yiiya-font-heading": `'${typo.heading.family}', serif`,
      "--yiiya-font-body": `'${typo.body.family}', sans-serif`,
      "--yiiya-font-mono": `'${typo.mono.family}', monospace`,
      "--yiiya-motion-duration": "0.6s",
      "--yiiya-motion-easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
    },
    fontPackages: Array.from(new Set([typo.heading.package, typo.body.package, typo.mono.package]))
  };
}
