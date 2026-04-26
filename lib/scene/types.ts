import type { SpatialMaterial } from "@/lib/materials";

export type ResolutionTier = "library" | "stylized" | "generated";

export type StylePreset =
  | "realistic"
  | "cartoon"
  | "anime"
  | "claymation"
  | "paper"
  | "sketch"
  | "lowpoly"
  | "holographic"
  | "glass"
  | "metallic";

export type AnimationPreset =
  | "none"
  | "float"
  | "rotate"
  | "pulse"
  | "bounce"
  | "wobble"
  | "drift"
  | "spin"
  | "static";

export type GenerationStatus = "ready" | "generating" | "failed";

export type CursorTarget = {
  screenX: number;
  screenY: number;
  domElementId: string | null;
  domTextContent: string | null;
  sceneObjectId: string | null;
  scenePoint: [number, number, number] | null;
  targetKind:
    | "dom-text"
    | "dom-image"
    | "dom-empty"
    | "scene-object"
    | "scene-empty"
    | "none";
  description: string;
};

export type SceneObjectBlueprint = {
  prompt?: string;
  resolvedName: string;
  tier: ResolutionTier;
  modelUrl: string;
  style: StylePreset;
  color: string;
  scale?: [number, number, number];
  rotation?: [number, number, number];
  animation?: AnimationPreset;
  material?: SpatialMaterial;
  semanticFamily?: string;
};
