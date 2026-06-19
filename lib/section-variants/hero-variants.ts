// @ts-nocheck
/**
 * Hero section variants — Viktor-Oddy-style HERO_VARIANTS catalog.
 *
 * One renderer per HERO type produces identical output across thousands of
 * sites — that's the slop. The fix: many variants per section, each with a
 * distinct motion personality + background algorithm + composition.
 *
 * Each entry maps to a real React component (you wire those up in your
 * existing components/website-layer.tsx — these are the IDs the Architect
 * emits via the new `variant` field on ADD_SECTION).
 */
import type { MotionPersonality } from "@/lib/brief/stake-matrix";

export type SectionVariantId =
  | "hero.cinema-letterbox"
  | "hero.kinetic-type"
  | "hero.editorial-still"
  | "hero.mesh-drift"
  | "hero.logo-marquee"
  | "hero.particle-field"
  | "hero.glass-stack"
  | "hero.type-explosion";

export type HeroVariant = {
  id: SectionVariantId;
  label: string;
  description: string;
  motion: MotionPersonality;
  backgroundAlgo:
    | "noise-monochrome"
    | "video-loop-fade"
    | "mesh-cursor-attract"
    | "logo-marquee"
    | "canvas-particles"
    | "liquid-glass"
    | "solid-warm"
    | "solid-cold";
  /** Best for which planted stake — used by the Architect to pick. */
  bestFor: ReadonlyArray<string>;
  /** Recommended copy length budget for the headline. */
  headlineMaxChars: number;
};

export const HERO_VARIANTS: ReadonlyArray<HeroVariant> = [
  {
    id: "hero.cinema-letterbox",
    label: "Cinema letterbox",
    description: "16:9 video loop, fade-in headline, subtle bottom CTA. Apple product page energy.",
    motion: "considered",
    backgroundAlgo: "video-loop-fade",
    bestFor: ["luxury", "premium", "editorial"],
    headlineMaxChars: 60
  },
  {
    id: "hero.kinetic-type",
    label: "Kinetic type",
    description: "Mask-reveal headline that explodes from the baseline. Big serif.",
    motion: "kinetic",
    backgroundAlgo: "noise-monochrome",
    bestFor: ["editorial-serif", "playful"],
    headlineMaxChars: 80
  },
  {
    id: "hero.editorial-still",
    label: "Editorial still",
    description: "Magazine-grade layout — single still image, generous margins, tight type.",
    motion: "still",
    backgroundAlgo: "solid-warm",
    bestFor: ["editorial-cream", "warm-neutral"],
    headlineMaxChars: 70
  },
  {
    id: "hero.mesh-drift",
    label: "Mesh drift",
    description: "Soft gradient mesh background that drifts toward the cursor.",
    motion: "reactive",
    backgroundAlgo: "mesh-cursor-attract",
    bestFor: ["midnight", "duotone"],
    headlineMaxChars: 70
  },
  {
    id: "hero.logo-marquee",
    label: "Logo marquee",
    description: "Headline above an infinite-scroll logo row. Social-proof maxxing.",
    motion: "kinetic",
    backgroundAlgo: "logo-marquee",
    bestFor: ["humanist-sans", "swiss-grotesk"],
    headlineMaxChars: 65
  },
  {
    id: "hero.particle-field",
    label: "Particle field",
    description: "Canvas particle cloud that responds to mouse. AI/ML brand energy.",
    motion: "reactive",
    backgroundAlgo: "canvas-particles",
    bestFor: ["mono-terminal", "midnight"],
    headlineMaxChars: 50
  },
  {
    id: "hero.glass-stack",
    label: "Glass stack",
    description: "Layered translucent panes with subtle transmission. Hardware-product vibe.",
    motion: "considered",
    backgroundAlgo: "liquid-glass",
    bestFor: ["luxury", "tech", "cold-clinical"],
    headlineMaxChars: 60
  },
  {
    id: "hero.type-explosion",
    label: "Type explosion",
    description: "Display headline mid-explosion, characters tossed in 3D space.",
    motion: "kinetic",
    backgroundAlgo: "solid-cold",
    bestFor: ["display-experimental", "brutalist"],
    headlineMaxChars: 40
  }
];

/**
 * Pick the best HERO variant for a given typographic voice + motion stake.
 * The Architect can override; this is the safe default.
 */
export function pickHeroVariant(
  typographyVoice: string,
  motion: MotionPersonality
): SectionVariantId {
  const motionMatches = HERO_VARIANTS.filter((v) => v.motion === motion);
  const pool = motionMatches.length ? motionMatches : HERO_VARIANTS;
  const typo = pool.find((v) => v.bestFor.includes(typographyVoice));
  return (typo ?? pool[0]).id;
}
