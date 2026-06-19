// @ts-nocheck
/**
 * Section variant manifest — the complete catalog the Architect picks from.
 *
 * Today only HERO is fully enumerated; FEATURES / METRICS / PRICING /
 * TESTIMONIALS / FAQ / CONTACT / FOOTER / NAVBAR start with a single safe
 * variant each and gain alternatives over time as we add renderers.
 */
import { HERO_VARIANTS, type SectionVariantId } from "./hero-variants";

export type SectionType =
  | "NAVBAR"
  | "HERO"
  | "ABOUT"
  | "SERVICES"
  | "FEATURES"
  | "METRICS"
  | "TESTIMONIALS"
  | "PRICING"
  | "FAQ"
  | "LOGO_STRIP"
  | "CONTACT"
  | "FOOTER";

export type Variant = {
  id: string;
  label: string;
  description: string;
  bestFor: ReadonlyArray<string>;
};

const SAFE_DEFAULT = (section: SectionType): Variant => ({
  id: `${section.toLowerCase()}.default`,
  label: `${section[0]}${section.slice(1).toLowerCase()} (default)`,
  description: `Single-column default for ${section}. Replace with a tailored variant when shipping production sites.`,
  bestFor: []
});

const MANIFEST: Record<SectionType, ReadonlyArray<Variant>> = {
  NAVBAR: [SAFE_DEFAULT("NAVBAR")],
  HERO: HERO_VARIANTS.map((v) => ({
    id: v.id,
    label: v.label,
    description: v.description,
    bestFor: v.bestFor
  })),
  ABOUT: [SAFE_DEFAULT("ABOUT")],
  SERVICES: [SAFE_DEFAULT("SERVICES")],
  FEATURES: [SAFE_DEFAULT("FEATURES")],
  METRICS: [SAFE_DEFAULT("METRICS")],
  TESTIMONIALS: [SAFE_DEFAULT("TESTIMONIALS")],
  PRICING: [SAFE_DEFAULT("PRICING")],
  FAQ: [SAFE_DEFAULT("FAQ")],
  LOGO_STRIP: [SAFE_DEFAULT("LOGO_STRIP")],
  CONTACT: [SAFE_DEFAULT("CONTACT")],
  FOOTER: [SAFE_DEFAULT("FOOTER")]
};

export function variantsFor(section: SectionType): ReadonlyArray<Variant> {
  return MANIFEST[section];
}

export function isValidVariant(section: SectionType, variantId: string): boolean {
  return MANIFEST[section].some((v) => v.id === variantId);
}

export function defaultVariant(section: SectionType): string {
  return MANIFEST[section][0].id;
}

export type { SectionVariantId };
