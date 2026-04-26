import { normalizeSpatialMaterial, type SpatialMaterial } from "@/lib/materials";
import type {
  AnimationPreset,
  SceneObjectBlueprint,
  StylePreset
} from "@/lib/scene/types";

type LibraryEntry = {
  modelUrl: string;
  aliases: string[];
  defaultScale: [number, number, number];
  semanticFamily: string;
  defaultAnimation?: AnimationPreset;
  defaultMaterial?: SpatialMaterial;
};

export const OBJECT_LIBRARY: Record<string, LibraryEntry> = {
  cup: {
    modelUrl: "library://cup",
    aliases: ["mug", "coffee cup", "tea cup", "glass"],
    defaultScale: [0.92, 0.92, 0.92],
    semanticFamily: "drinkware"
  },
  bottle: {
    modelUrl: "library://bottle",
    aliases: ["water bottle", "glass bottle", "cologne bottle"],
    defaultScale: [0.82, 1.28, 0.82],
    semanticFamily: "bottle"
  },
  laptop: {
    modelUrl: "library://laptop",
    aliases: ["computer", "macbook", "notebook"],
    defaultScale: [1.26, 0.94, 1.08],
    semanticFamily: "device"
  },
  phone: {
    modelUrl: "library://phone",
    aliases: ["iphone", "smartphone", "mobile"],
    defaultScale: [0.9, 1.16, 0.18],
    semanticFamily: "device"
  },
  watch: {
    modelUrl: "library://watch",
    aliases: ["wristwatch", "luxury watch", "timepiece"],
    defaultScale: [1.08, 1.08, 0.28],
    semanticFamily: "apparel",
    defaultMaterial: "carbon"
  },
  chair: {
    modelUrl: "library://chair",
    aliases: ["seat", "stool"],
    defaultScale: [1.04, 1.12, 1.04],
    semanticFamily: "furniture"
  },
  table: {
    modelUrl: "library://table",
    aliases: ["desk", "side table"],
    defaultScale: [1.3, 0.8, 1.3],
    semanticFamily: "furniture"
  },
  lamp: {
    modelUrl: "library://lamp",
    aliases: ["light", "desk lamp", "floor lamp"],
    defaultScale: [0.84, 1.3, 0.84],
    semanticFamily: "furniture"
  },
  car: {
    modelUrl: "library://car",
    aliases: ["vehicle", "sedan", "sports car", "automobile"],
    defaultScale: [1.3, 0.92, 1.84],
    semanticFamily: "vehicle"
  },
  shoe: {
    modelUrl: "library://shoe",
    aliases: ["sneaker", "trainer", "boot", "heel"],
    defaultScale: [1.18, 0.78, 1.42],
    semanticFamily: "apparel"
  },
  bust: {
    modelUrl: "library://bust",
    aliases: ["portrait", "head", "statue", "person"],
    defaultScale: [1, 1.28, 1],
    semanticFamily: "portrait"
  },
  pedestal: {
    modelUrl: "library://pedestal",
    aliases: ["plinth", "stand", "display stand"],
    defaultScale: [1.18, 0.52, 1.18],
    semanticFamily: "pedestal",
    defaultAnimation: "static"
  },
  camera: {
    modelUrl: "library://camera",
    aliases: ["dslr", "photography camera", "film camera"],
    defaultScale: [1.02, 0.82, 1.12],
    semanticFamily: "device"
  },
  bag: {
    modelUrl: "library://bag",
    aliases: ["handbag", "backpack", "tote"],
    defaultScale: [0.98, 1.08, 0.52],
    semanticFamily: "apparel"
  },
  plant: {
    modelUrl: "library://plant",
    aliases: ["tree", "flower", "palm"],
    defaultScale: [1.05, 1.44, 1.05],
    semanticFamily: "organic"
  },
  abstract: {
    modelUrl: "library://abstract",
    aliases: ["blob", "sculpture", "orb", "shape"],
    defaultScale: [1, 1, 1],
    semanticFamily: "abstract"
  }
};

function normalizePrompt(prompt: string) {
  return prompt.trim().toLowerCase();
}

export function inferStylePreset(prompt: string, material?: unknown): StylePreset {
  const text = normalizePrompt(prompt);

  if (text.includes("cartoon")) return "cartoon";
  if (text.includes("anime")) return "anime";
  if (text.includes("clay")) return "claymation";
  if (text.includes("paper")) return "paper";
  if (text.includes("sketch")) return "sketch";
  if (text.includes("low poly") || text.includes("lowpoly")) return "lowpoly";
  if (text.includes("holographic")) return "holographic";
  if (text.includes("glass")) return "glass";
  if (
    text.includes("metal") ||
    text.includes("metallic") ||
    text.includes("chrome") ||
    text.includes("gold")
  ) {
    return "metallic";
  }

  const normalizedMaterial = normalizeSpatialMaterial(material);

  if (normalizedMaterial === "glass") return "glass";
  if (
    normalizedMaterial === "chrome" ||
    normalizedMaterial === "gold" ||
    normalizedMaterial === "holographic"
  ) {
    return normalizedMaterial === "holographic" ? "holographic" : "metallic";
  }

  return "realistic";
}

export function resolveLibraryObject(prompt: string) {
  const normalized = normalizePrompt(prompt);

  for (const [name, entry] of Object.entries(OBJECT_LIBRARY)) {
    if (normalized.includes(name)) {
      return { name, entry };
    }

    if (entry.aliases.some((alias) => normalized.includes(alias))) {
      return { name, entry };
    }
  }

  return null;
}

export function resolveSceneBlueprint(input: {
  prompt?: string;
  shape?: string;
  semanticFamily?: string;
  color?: string;
  material?: unknown;
  scale?: [number, number, number];
  animation?: string;
  modelUrl?: string;
  resolvedName?: string;
}): SceneObjectBlueprint {
  const prompt = input.prompt ?? input.resolvedName ?? input.shape ?? "abstract object";
  const style = inferStylePreset(prompt, input.material);
  const color = input.color ?? "#EF9F27";
  const normalizedMaterial = normalizeSpatialMaterial(input.material);

  if (typeof input.modelUrl === "string" && input.modelUrl.length > 0) {
    const resolvedName = input.resolvedName ?? prompt.toLowerCase().trim();

    return {
      prompt,
      resolvedName,
      tier: input.modelUrl.startsWith("library://") ? "library" : "generated",
      modelUrl: input.modelUrl,
      style,
      color,
      scale: input.scale ?? [1, 1, 1],
      animation: (input.animation as AnimationPreset | undefined) ?? "float",
      material: normalizedMaterial,
      semanticFamily: input.semanticFamily
    };
  }

  const libraryHit = resolveLibraryObject(
    [prompt, input.resolvedName, input.shape, input.semanticFamily]
      .filter(Boolean)
      .join(" ")
  );

  if (libraryHit) {
    return {
      prompt,
      resolvedName: libraryHit.name,
      tier: style === "realistic" ? "library" : "stylized",
      modelUrl: libraryHit.entry.modelUrl,
      style,
      color,
      scale: input.scale ?? libraryHit.entry.defaultScale,
      animation:
        (input.animation as AnimationPreset | undefined) ??
        libraryHit.entry.defaultAnimation ??
        "float",
      material: libraryHit.entry.defaultMaterial ?? normalizedMaterial,
      semanticFamily: input.semanticFamily ?? libraryHit.entry.semanticFamily
    };
  }

  return {
    prompt,
    resolvedName: input.resolvedName ?? input.shape ?? "abstract",
    tier: "stylized",
    modelUrl: "library://abstract",
    style,
    color,
    scale: input.scale ?? [1, 1, 1],
    animation: (input.animation as AnimationPreset | undefined) ?? "float",
    material: normalizedMaterial,
    semanticFamily: input.semanticFamily ?? "abstract"
  };
}
