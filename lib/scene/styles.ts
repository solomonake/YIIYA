import type { MeshPhysicalMaterialProps } from "@react-three/fiber";
import type { SpatialMaterial } from "@/lib/materials";
import type { StylePreset } from "@/lib/scene/types";

type StyleMaterialPack = {
  materialType: "physical" | "toon" | "standard";
  materialProps: MeshPhysicalMaterialProps;
  flatShading?: boolean;
  wireframe?: boolean;
};

export function styleFromMaterial(material: SpatialMaterial): StylePreset {
  if (material === "glass") return "glass";
  if (material === "holographic") return "holographic";
  if (material === "chrome" || material === "gold") return "metallic";

  return "realistic";
}

export function styleMaterialPack(
  style: StylePreset,
  color: string,
  materialHint: SpatialMaterial
): StyleMaterialPack {
  if (style === "cartoon" || style === "anime") {
    return {
      materialType: "toon",
      materialProps: {
        color,
        roughness: 0.75,
        metalness: 0
      }
    };
  }

  if (style === "claymation") {
    return {
      materialType: "physical",
      materialProps: {
        color,
        roughness: 0.88,
        metalness: 0,
        sheen: 0.35,
        clearcoat: 0.04
      }
    };
  }

  if (style === "paper" || style === "sketch") {
    return {
      materialType: "standard",
      materialProps: {
        color: style === "paper" ? color : "#ECE7DD",
        roughness: 1,
        metalness: 0
      },
      wireframe: style === "sketch"
    };
  }

  if (style === "lowpoly") {
    return {
      materialType: "standard",
      materialProps: {
        color,
        roughness: 0.72,
        metalness: 0.05
      },
      flatShading: true
    };
  }

  if (style === "holographic") {
    return {
      materialType: "physical",
      materialProps: {
        color,
        transparent: true,
        opacity: 0.82,
        roughness: 0.08,
        metalness: 0.88,
        emissive: "#1744aa",
        emissiveIntensity: 0.35
      }
    };
  }

  if (style === "glass") {
    return {
      materialType: "physical",
      materialProps: {
        color,
        transmission: 1,
        transparent: true,
        opacity: 0.88,
        roughness: 0.04,
        metalness: 0
      }
    };
  }

  if (style === "metallic" || materialHint === "gold" || materialHint === "chrome") {
    return {
      materialType: "physical",
      materialProps: {
        color: materialHint === "gold" ? "#FFD700" : color,
        roughness: materialHint === "gold" ? 0.22 : 0.08,
        metalness: 1,
        clearcoat: 0.4
      }
    };
  }

  return {
    materialType: "physical",
    materialProps: {
      color,
      roughness: materialHint === "carbon" ? 0.45 : 0.56,
      metalness: materialHint === "carbon" ? 0.78 : 0.18,
      clearcoat: 0.16
    }
  };
}
