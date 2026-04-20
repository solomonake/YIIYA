export type SpatialMaterial =
  | "glass"
  | "chrome"
  | "gold"
  | "matte"
  | "carbon"
  | "holographic";

export const materialPresets = {
  glass: {
    transmission: 1,
    roughness: 0,
    metalness: 0,
    transparent: true,
    opacity: 0.85
  },
  chrome: { metalness: 1, roughness: 0.05, color: "#c0c0c0" },
  gold: { metalness: 1, roughness: 0.15, color: "#d4a017" },
  matte: { roughness: 0.95, metalness: 0 },
  carbon: { roughness: 0.4, metalness: 0.8, color: "#1a1a1a" },
  holographic: {
    metalness: 0.9,
    roughness: 0.1,
    color: "#88ccff",
    emissive: "#0044aa",
    emissiveIntensity: 0.3
  }
} satisfies Record<SpatialMaterial, Record<string, unknown>>;

export function normalizeSpatialMaterial(material: unknown): SpatialMaterial {
  if (typeof material !== "string") {
    return "matte";
  }

  const normalized = material.toLowerCase();

  if (
    normalized === "glass" ||
    normalized === "chrome" ||
    normalized === "gold" ||
    normalized === "matte" ||
    normalized === "carbon" ||
    normalized === "holographic"
  ) {
    return normalized;
  }

  return "matte";
}
