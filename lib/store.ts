"use client";

import { create } from "zustand";
import {
  defaultYiiyaTheme,
  mergeYiiyaTheme,
  type YiiyaTheme
} from "@/lib/designSystem";
import type { CreativeBrief } from "@/lib/creative-brief";
import { creationPathways, type CreationPathway } from "@/lib/creation-pathways";
import { normalizeSpatialMaterial, type SpatialMaterial } from "@/lib/materials";
import type {
  AnimationPreset,
  CursorTarget,
  GenerationStatus,
  ResolutionTier,
  StylePreset
} from "@/lib/scene/types";
import type { ScanJobSummary } from "@/lib/scan-types";
import type { PublishedProject } from "@/lib/published-project-types";
import { createProjectSlug } from "@/lib/project-slug";
import type { ExportTarget } from "@/lib/spatial-export";

export type Layer = {
  id: string;
  name: string;
  type: "site" | "scene" | "mesh" | "light" | "section";
};

export type TimelineSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  summary: string;
  sections: YiiyaSection[];
  sceneObjects: SceneObject[];
  layers: Layer[];
  themeState: YiiyaTheme;
  blobState: BlobState;
  canvasMode: CanvasMode;
  brief: CreativeBrief | null;
  htmlCanvasImage?: string;
  sceneCanvasImage?: string | null;
};

export type LogEntry = {
  id: string;
  label: string;
  timestamp: string;
};

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

export type SectionTheme = {
  background?: string;
  backgroundColor?: string;
  backgroundColour?: string;
  color?: string;
  textColor?: string;
  textColour?: string;
  "text colour"?: string;
  accentColor?: string;
  accentColour?: string;
  "accent colour"?: string;
};

export type SectionContent = Record<string, unknown>;

export type YiiyaSection = {
  id: string;
  sectionType: SectionType;
  layoutVariant?: string;
  theme: SectionTheme;
  content: SectionContent;
};

export type SceneObject = {
  id: string;
  prompt: string;
  resolvedName: string;
  source: "scan" | "generate";
  scanResultId?: string;
  tier: ResolutionTier;
  modelUrl: string;
  style: StylePreset;
  generationStatus: GenerationStatus;
  materializedAt: number;
  rotation: [number, number, number];
  shape: string;
  semanticFamily?: string;
  material: SpatialMaterial;
  color: string;
  animation: AnimationPreset;
  position: [number, number, number];
  scale: [number, number, number];
  intensity: number;
  meshUrl?: string;
  opacity?: number;
  materialOverrides?: Record<string, unknown>;
  anchorSection?: string;
};

export type BlobState = {
  targetShape: "sphere" | "bottle" | "cube" | "organic" | "crystal";
  formation: "sphere" | "helix" | "torus" | "bottle" | "capsule" | "cube" | "wave";
  distort: number;
  speed: number;
  aspectRatio: number;
  morphProgress: number;
  material: SpatialMaterial;
  glow: number;
  chaos: number;
  twist: number;
  particleDensity: number;
  controlledByHand: boolean;
  silhouette?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type SpatialAnchor = {
  objectId: string;
  elementId: string;
  placement: "behind" | "left" | "right" | "above" | "center";
  worldPosition: [number, number, number];
};

export type ReferenceImage = {
  base64: string;
  mediaType: string;
  name: string;
  previewUrl?: string;
  dominantColor?: string;
  accentCandidate?: string;
  extractedMode?: "dark" | "light";
  imageMode?: "web" | "3d" | "hybrid";
};

export type LabControl = {
  id: string;
  label: string;
  kind: "range";
  min: number;
  max: number;
  step: number;
  value: number;
  target: "blob" | "theme" | "section" | "object";
  property: string;
};

export type YiiyaMessage = {
  role: "user" | "assistant";
  content: string;
};

export type YiiyaAction =
  | {
      type: "ADD_SECTION";
      payload: {
        sectionType: unknown;
        layoutVariant?: unknown;
        theme?: unknown;
        content?: unknown;
      };
    }
  | {
      type: "ADD_3D_OBJECT";
      payload: {
        prompt?: unknown;
        resolvedName?: unknown;
        tier?: unknown;
        modelUrl?: unknown;
        style?: unknown;
        generationStatus?: unknown;
        shape: unknown;
        semanticFamily?: unknown;
        material?: unknown;
        color?: unknown;
        animation?: unknown;
        position?: unknown;
        scale?: unknown;
        intensity?: unknown;
        anchorSection?: unknown;
      };
    }
  | {
      type: "ADD_SPATIAL_OBJECT";
      payload: {
        prompt?: unknown;
        resolvedName?: unknown;
        tier?: unknown;
        modelUrl?: unknown;
        style?: unknown;
        generationStatus?: unknown;
        shape: unknown;
        semanticFamily?: unknown;
        material: unknown;
        color: unknown;
        animation: unknown;
        position: unknown;
        anchorSection?: unknown;
      };
    }
  | {
      type: "MORPH_BLOB";
      payload: {
        targetShape: unknown;
        formation?: unknown;
        distort: unknown;
        speed: unknown;
        aspectRatio?: unknown;
        morphProgress?: unknown;
        material?: unknown;
        glow?: unknown;
        chaos?: unknown;
        twist?: unknown;
        particleDensity?: unknown;
        silhouette?: unknown;
      };
    }
  | {
      type: "MOLD_BLOB";
      payload: {
        targetShape?: unknown;
        formation?: unknown;
        material?: unknown;
        distort?: unknown;
        speed?: unknown;
        aspectRatio?: unknown;
        glow?: unknown;
        chaos?: unknown;
        twist?: unknown;
        particleDensity?: unknown;
        silhouette?: unknown;
      };
    }
  | {
      type: "SET_BLOB_FORMATION";
      payload: {
        formation: unknown;
        targetShape?: unknown;
        aspectRatio?: unknown;
      };
    }
  | {
      type: "LOAD_3D_MESH";
      payload: {
        url: unknown;
        prompt?: unknown;
        resolvedName?: unknown;
        style?: unknown;
        tier?: unknown;
        material?: unknown;
        color?: unknown;
        scale?: unknown;
        position?: unknown;
        anchorSection?: unknown;
      };
    }
  | {
      type: "SET_MATERIAL";
      payload: {
        objectId: unknown;
        material: unknown;
        metalness?: unknown;
        roughness?: unknown;
        color?: unknown;
        transmission?: unknown;
        emissive?: unknown;
      };
    }
  | {
      type: "RESHAPE_OBJECT";
      payload: {
        objectId: unknown;
        scaleX?: unknown;
        scaleY?: unknown;
        scaleZ?: unknown;
      };
    }
  | {
      type: "SET_OBJECT_TRANSFORM";
      payload: {
        objectId: unknown;
        position?: unknown;
        scale?: unknown;
        rotation?: unknown;
      };
    }
  | {
      type: "SET_OBJECT_ANIMATION";
      payload: {
        objectId: unknown;
        animation: unknown;
        intensity?: unknown;
      };
    }
  | {
      type: "MOVE_OBJECT";
      payload: {
        objectId: unknown;
        delta?: unknown;
        position?: unknown;
      };
    }
  | {
      type: "REMOVE_OBJECT";
      payload: { objectId: unknown };
    }
  | {
      type: "SPAWN_CONTROL";
      payload: {
        id: unknown;
        label: unknown;
        min: unknown;
        max: unknown;
        step?: unknown;
        value: unknown;
        target: unknown;
        property: unknown;
      };
    }
  | {
      type: "SET_CONTROL_VALUE";
      payload: {
        id: unknown;
        value: unknown;
      };
    }
  | {
      type: "ADD_LIGHT";
      payload: {
        lightType?: unknown;
        position?: unknown;
        color?: unknown;
        intensity?: unknown;
      };
    }
  | {
      type: "MODIFY_ELEMENT";
      payload: {
        elementId: unknown;
        property: unknown;
        value: unknown;
        mode?: unknown;
      };
    }
  | {
      type: "SET_PROJECT_NAME";
      payload: { projectName: unknown };
    }
  | {
      type: "CHANGE_THEME";
      payload: { property: unknown; value: unknown };
    }
  | {
      type: "SET_GLOBAL_THEME";
      payload: {
        spacingMultiplier?: unknown;
        borderRadius?: unknown;
        primaryAccent?: unknown;
        fontScale?: unknown;
        layoutDensity?: unknown;
        palette?: unknown;
        fontWeight?: unknown;
      };
    }
  | {
      type: "SYNC_BRAND_TO_IMAGE";
      payload: {
        palette?: unknown;
        fontWeights?: unknown;
        layoutStructure?: unknown;
        visualTone?: unknown;
      };
    }
  | {
      type: "ADJUST_DENSITY";
      payload: { scale: unknown };
    }
  | {
      type: "PUBLISH";
      payload: Record<string, never>;
    }
  | {
      type: "RESET_PROJECT";
      payload: Record<string, never>;
    }
  | {
      type: "SET_MODE";
      payload: { mode: unknown };
    }
  | {
      type: "UNDO";
      payload: Record<string, never>;
    }
  | {
      type: "REDO";
      payload: Record<string, never>;
    };

export type CanvasMode = "WEB" | "3D" | "HYBRID";

export type SavedProjectState = {
  id?: string;
  currentProjectId?: string;
  projectName?: string;
  logLabel?: string;
  canvas_json?: {
    sections?: YiiyaSection[];
    sceneObjects?: SceneObject[];
    layers?: Layer[];
  };
  theme_json?: Partial<YiiyaTheme>;
  sections?: YiiyaSection[];
  sceneObjects?: SceneObject[];
  layers?: Layer[];
  themeState?: Partial<YiiyaTheme>;
};

type UndoSnapshot = {
  projectName: string;
  sections: YiiyaSection[];
  sceneObjects: SceneObject[];
  layers: Layer[];
  themeState: YiiyaTheme;
  blobState: BlobState;
  spatialAnchors: SpatialAnchor[];
  labControls: LabControl[];
};

type YiiyaState = {
  currentProjectId: string;
  currentProjectSlug: string;
  projectName: string;
  isGuest: boolean;
  isPro: boolean;
  creationGoal: "web" | "spatial" | "scan";
  starterPromptId: string | null;
  canvasMode: CanvasMode;
  strategyMode: boolean;
  isListening: boolean;
  isInterpreting: boolean;
  transcript: string;
  interimTranscript: string;
  selectedElementId: string | null;
  selectedElements: string[];
  hoveredElementId: string | null;
  cursorTarget: CursorTarget | null;
  referenceImage: ReferenceImage | null;
  toastMessage: string | null;
  publishResult: PublishedProject | null;
  saveStatus: "idle" | "saving" | "saved";
  lastSavedAt: string | null;
  activeBrief: CreativeBrief | null;
  lastFallbackPath: string | null;
  timelineSnapshots: TimelineSnapshot[];
  activeTimelineSnapshotId: string | null;
  creationPathways: CreationPathway[];
  scanJob: ScanJobSummary | null;
  themeState: YiiyaTheme;
  sidebarCollapsed: boolean;
  sections: YiiyaSection[];
  sceneObjects: SceneObject[];
  blobState: BlobState;
  spatialAnchors: SpatialAnchor[];
  labControls: LabControl[];
  layers: Layer[];
  logs: LogEntry[];
  conversationHistory: YiiyaMessage[];
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];
  setCurrentProjectId: (currentProjectId: string) => void;
  setProjectName: (projectName: string) => void;
  renameProject: (projectName: string) => void;
  setGuest: (isGuest: boolean) => void;
  setPro: (isPro: boolean) => void;
  setCreationGoal: (creationGoal: "web" | "spatial" | "scan") => void;
  setStarterPromptId: (starterPromptId: string | null) => void;
  setCanvasMode: (canvasMode: CanvasMode) => void;
  setStrategyMode: (strategyMode: boolean) => void;
  setCurrentProjectSlug: (currentProjectSlug: string) => void;
  setListening: (isListening: boolean) => void;
  setInterpreting: (isInterpreting: boolean) => void;
  setTranscript: (transcript: string) => void;
  setInterimTranscript: (interimTranscript: string) => void;
  setSelectedElementId: (selectedElementId: string | null) => void;
  setSelectedElements: (selectedElements: string[]) => void;
  setHoveredElementId: (hoveredElementId: string | null) => void;
  setCursorTarget: (cursorTarget: CursorTarget | null) => void;
  updateCursor3D: (scene: Pick<CursorTarget, "sceneObjectId" | "scenePoint">) => void;
  setReferenceImage: (referenceImage: ReferenceImage | null) => void;
  setToastMessage: (toastMessage: string | null) => void;
  setPublishResult: (publishResult: PublishedProject | null) => void;
  setSaveStatus: (status: "idle" | "saving" | "saved", savedAt?: string) => void;
  setActiveBrief: (brief: CreativeBrief | null, fallbackPath?: string | null) => void;
  setScanJob: (scanJob: ScanJobSummary | null) => void;
  pushTimelineSnapshot: (snapshot: TimelineSnapshot) => void;
  restoreTimelineSnapshot: (snapshotId: string) => void;
  setThemeState: (themeState: Partial<YiiyaTheme>) => void;
  addSection: (section: {
    sectionType: unknown;
    layoutVariant?: unknown;
    theme?: unknown;
    content?: unknown;
  }) => YiiyaSection;
  removeSection: (sectionId: string) => void;
  addSceneObject: (object: {
    prompt?: unknown;
    resolvedName?: unknown;
    tier?: unknown;
    modelUrl?: unknown;
    style?: unknown;
    generationStatus?: unknown;
    shape?: unknown;
    semanticFamily?: unknown;
    material?: unknown;
    color?: unknown;
    animation?: unknown;
    position?: unknown;
    scale?: unknown;
    rotation?: unknown;
    intensity?: unknown;
    meshUrl?: unknown;
    anchorSection?: unknown;
    source?: unknown;
    scanResultId?: unknown;
  }) => SceneObject;
  morphBlob: (blobState: Partial<BlobState>) => void;
  spawnControl: (control: Omit<LabControl, "kind"> & { kind?: "range" }) => void;
  setControlValue: (id: string, value: number) => void;
  addSpatialAnchor: (anchor: SpatialAnchor) => void;
  updateSceneObject: (
    objectId: string,
    updates: Partial<Omit<SceneObject, "material">> & { material?: unknown }
  ) => void;
  updateSceneObjectLive: (
    objectId: string,
    updates: Partial<Omit<SceneObject, "material">> & { material?: unknown }
  ) => void;
  removeSceneObject: (objectId: string) => void;
  popUndo: () => void;
  popRedo: () => void;
  updateElementContent: (elementId: string, value: string) => void;
  addLog: (label: string) => void;
  addActionLogs: (actions: YiiyaAction[]) => void;
  addMessage: (message: YiiyaMessage) => void;
  loadProject: (project: SavedProjectState) => void;
  resetProject: () => void;
  toggleSidebar: () => void;
  setExportTarget: (exportTarget: ExportTarget) => void;
  exportTarget: ExportTarget;
};

const initialLayers: Layer[] = [];

const defaultProjectName = "untitled project";

const initialLogs: LogEntry[] = [
  { id: "log-1", label: "SYSTEM: Waiting for input.", timestamp: "--:--:--" }
];

function pushUndoSnapshot(state: YiiyaState) {
  return [
    ...state.undoStack,
    {
      projectName: state.projectName,
      sections: state.sections,
      sceneObjects: state.sceneObjects,
      layers: state.layers,
      themeState: state.themeState,
      blobState: state.blobState,
      spatialAnchors: state.spatialAnchors,
      labControls: state.labControls
    }
  ].slice(-20);
}

function snapshotFromState(state: YiiyaState): UndoSnapshot {
  return {
    projectName: state.projectName,
    sections: state.sections,
    sceneObjects: state.sceneObjects,
    layers: state.layers,
    themeState: state.themeState,
    blobState: state.blobState,
    spatialAnchors: state.spatialAnchors,
    labControls: state.labControls
  };
}

function replaceKnownBrandValues(
  content: SectionContent,
  oldName: string,
  nextName: string,
  forceKeys: string[] = []
) {
  const nextContent: SectionContent = {};

  for (const [key, value] of Object.entries(content)) {
    if (typeof value === "string") {
      nextContent[key] =
        forceKeys.includes(key) || value.includes(oldName)
          ? value.replaceAll(oldName, nextName)
          : value;
    } else {
      nextContent[key] = value;
    }
  }

  for (const key of forceKeys) {
    if (typeof nextContent[key] !== "string") {
      nextContent[key] = nextName;
    }
  }

  return nextContent;
}

function contentKeyFromElementId(elementId: string) {
  if (elementId.includes("brand")) {
    return "brand";
  }

  if (elementId.includes("title") || elementId.includes("heading")) {
    return "heading";
  }

  if (elementId.includes("subtext") || elementId.includes("description")) {
    return "subtext";
  }

  if (elementId.includes("cta") || elementId.includes("submit")) {
    return "cta";
  }

  if (elementId.includes("quote")) {
    return "quote";
  }

  if (elementId.includes("name")) {
    return "name";
  }

  if (elementId.includes("role")) {
    return "role";
  }

  if (elementId.includes("price")) {
    return "price";
  }

  if (elementId.includes("label")) {
    return "label";
  }

  return null;
}

function sectionIndexFromElementId(elementId: string) {
  const match = elementId.match(/-(\d+)(?:-\d+)?$/);
  const parsed = match ? Number.parseInt(match[1], 10) : Number.NaN;

  return Number.isFinite(parsed) ? parsed - 1 : -1;
}

function createProjectId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createInitialLog(label = "SYSTEM: New project session initialized.") {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    timestamp: new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date())
  };
}

function createLog(label: string): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    timestamp: new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date())
  };
}

function describeAction(action: YiiyaAction) {
  if (action.type === "ADD_SECTION") {
    const sectionType =
      typeof action.payload.sectionType === "string"
        ? action.payload.sectionType.toUpperCase()
        : "HERO";

    return `[EXECUTE]: Injecting ${sectionType}_Section_v2.`;
  }

  if (action.type === "ADD_SPATIAL_OBJECT" || action.type === "ADD_3D_OBJECT") {
    const shape =
      typeof action.payload.shape === "string" ? action.payload.shape : "object";
    const material =
      "material" in action.payload && typeof action.payload.material === "string"
        ? action.payload.material
        : "matte";

    return `[EXECUTE]: Mounting ${material}_${shape}.`;
  }

  if (action.type === "LOAD_3D_MESH") {
    return "[EXECUTE]: Loading generated 3D mesh.";
  }

  if (action.type === "MORPH_BLOB") {
    return `[EXECUTE]: Morphing blob to ${String(action.payload.targetShape)}.`;
  }

  if (action.type === "MOLD_BLOB") {
    return `[MOLD]: Shaping clay as ${String(action.payload.formation ?? action.payload.targetShape ?? "organic")}.`;
  }

  if (action.type === "SET_BLOB_FORMATION") {
    return `[MOLD]: Formation set to ${String(action.payload.formation)}.`;
  }

  if (action.type === "SET_MATERIAL") {
    return `[EXECUTE]: Applying ${String(action.payload.material)} material.`;
  }

  if (action.type === "RESHAPE_OBJECT") {
    return "[EXECUTE]: Reshaping spatial object.";
  }

  if (action.type === "MOVE_OBJECT" || action.type === "SET_OBJECT_TRANSFORM") {
    return "[MOLD]: Spatial object moved.";
  }

  if (action.type === "SET_OBJECT_ANIMATION") {
    return `[MOLD]: Object animation set to ${String(action.payload.animation)}.`;
  }

  if (action.type === "SPAWN_CONTROL") {
    return `[LAB]: Control spawned — ${String(action.payload.label)}.`;
  }

  if (action.type === "SET_CONTROL_VALUE") {
    return `[LAB]: Control ${String(action.payload.id)} updated.`;
  }

  if (action.type === "REMOVE_OBJECT") {
    return "[EXECUTE]: Removing spatial object.";
  }

  if (action.type === "ADD_LIGHT") {
    return "[EXECUTE]: Lighting spatial scene.";
  }

  if (action.type === "SET_GLOBAL_THEME") {
    const density =
      typeof action.payload.layoutDensity === "string"
        ? action.payload.layoutDensity
        : "token";

    return `[EXECUTE]: Syncing global ${density} system.`;
  }

  if (action.type === "SYNC_BRAND_TO_IMAGE") {
    const tone =
      typeof action.payload.visualTone === "string"
        ? action.payload.visualTone
        : "reference";

    return `[EXECUTE]: Brand image mapped to '${tone}'.`;
  }

  if (action.type === "ADJUST_DENSITY") {
    return `[EXECUTE]: Scaling layout to ${String(action.payload.scale)}.`;
  }

  if (action.type === "MODIFY_ELEMENT") {
    const elementId =
      typeof action.payload.elementId === "string"
        ? action.payload.elementId
        : "active-element";
    const property =
      typeof action.payload.property === "string"
        ? action.payload.property
        : "property";

    return `[EXECUTE]: Applying '${property}' to '${elementId}'.`;
  }

  if (action.type === "CHANGE_THEME") {
    const property =
      typeof action.payload.property === "string"
        ? action.payload.property
        : "theme";

    return `[EXECUTE]: Applying legacy ${property}.`;
  }

  if (action.type === "RESET_PROJECT") {
    return "[EXECUTE]: Resetting project.";
  }

  if (action.type === "SET_MODE") {
    return `[EXECUTE]: Switching canvas mode to ${String(action.payload.mode)}.`;
  }

  if (action.type === "UNDO") {
    return "[EXECUTE]: Reverting last change.";
  }

  if (action.type === "REDO") {
    return "[EXECUTE]: Reapplying reverted change.";
  }

  if (action.type === "SET_PROJECT_NAME") {
    return `[EXECUTE]: Renaming project to ${String(action.payload.projectName)}.`;
  }

  return "[EXECUTE]: Generating public artifact.";
}

function normalizeLayoutVariant(value: unknown, sectionType: SectionType) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.toUpperCase();

  if (
    sectionType === "HERO" &&
    (normalized === "CENTERED_IMPACT" ||
      normalized === "EDITORIAL_SPLIT" ||
      normalized === "BENTO_GRID")
  ) {
    return normalized;
  }

  if (
    sectionType === "FEATURES" &&
    (normalized === "FEATURES_GRID" || normalized === "FEATURES_HORIZONTAL")
  ) {
    return normalized;
  }

  return undefined;
}

function normalizeSectionType(sectionType: unknown): SectionType {
  if (typeof sectionType !== "string") {
    return "HERO";
  }

  const normalized = sectionType.toUpperCase();

  if (
    normalized === "NAVBAR" ||
    normalized === "HERO" ||
    normalized === "ABOUT" ||
    normalized === "SERVICES" ||
    normalized === "FEATURES" ||
    normalized === "METRICS" ||
    normalized === "TESTIMONIALS" ||
    normalized === "PRICING" ||
    normalized === "FAQ" ||
    normalized === "LOGO_STRIP" ||
    normalized === "CONTACT" ||
    normalized === "FOOTER"
  ) {
    return normalized;
  }

  return "HERO";
}

function normalizeRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizePosition(position: unknown): [number, number, number] {
  if (!Array.isArray(position)) {
    return [0, 1.2, 0];
  }

  return [
    typeof position[0] === "number" ? position[0] : 0,
    typeof position[1] === "number" ? position[1] : 1.2,
    typeof position[2] === "number" ? position[2] : 0
  ];
}

function normalizeVector(value: unknown, fallback: [number, number, number]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return [
    typeof value[0] === "number" ? value[0] : fallback[0],
    typeof value[1] === "number" ? value[1] : fallback[1],
    typeof value[2] === "number" ? value[2] : fallback[2]
  ] satisfies [number, number, number];
}

function normalizeRotation(value: unknown) {
  return normalizeVector(value, [0, 0, 0]);
}

function normalizeStylePreset(value: unknown): StylePreset {
  if (
    value === "realistic" ||
    value === "cartoon" ||
    value === "anime" ||
    value === "claymation" ||
    value === "paper" ||
    value === "sketch" ||
    value === "lowpoly" ||
    value === "holographic" ||
    value === "glass" ||
    value === "metallic"
  ) {
    return value;
  }

  return "realistic";
}

function normalizeResolutionTier(value: unknown): ResolutionTier {
  if (value === "library" || value === "stylized" || value === "generated") {
    return value;
  }

  return "stylized";
}

function normalizeGenerationStatus(value: unknown): GenerationStatus {
  if (value === "ready" || value === "generating" || value === "failed") {
    return value;
  }

  return "ready";
}

function normalizeAnimationPreset(value: unknown): AnimationPreset {
  if (
    value === "none" ||
    value === "float" ||
    value === "rotate" ||
    value === "pulse" ||
    value === "bounce" ||
    value === "wobble" ||
    value === "drift" ||
    value === "spin" ||
    value === "static"
  ) {
    return value;
  }

  return "float";
}

function normalizeNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function normalizeBlobTarget(value: unknown): BlobState["targetShape"] {
  if (
    value === "sphere" ||
    value === "bottle" ||
    value === "cube" ||
    value === "organic" ||
    value === "crystal"
  ) {
    return value;
  }

  return "sphere";
}

function normalizeBlobFormation(value: unknown): BlobState["formation"] {
  if (
    value === "sphere" ||
    value === "helix" ||
    value === "torus" ||
    value === "bottle" ||
    value === "capsule" ||
    value === "cube" ||
    value === "wave"
  ) {
    return value;
  }

  return "sphere";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function defaultBlobState(): BlobState {
  return {
    targetShape: "sphere",
    formation: "sphere",
    distort: 0.5,
    speed: 1.8,
    aspectRatio: 1,
    morphProgress: 0,
    material: "carbon",
    glow: 0.35,
    chaos: 0.22,
    twist: 0,
    particleDensity: 9000,
    controlledByHand: false
  };
}

function normalizeSilhouette(value: unknown): BlobState["silhouette"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const x = normalizeNumber(record.x, 0);
  const y = normalizeNumber(record.y, 0);
  const width = normalizeNumber(record.width, 1);
  const height = normalizeNumber(record.height, 1);

  return { x, y, width, height };
}

function normalizeSceneObjectRecord(value: unknown): SceneObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const shape =
    typeof record.shape === "string"
      ? record.shape
      : typeof record.resolvedName === "string"
        ? record.resolvedName
        : "abstract";
  const resolvedName =
    typeof record.resolvedName === "string" ? record.resolvedName : shape;
  const modelUrl =
    typeof record.modelUrl === "string"
      ? record.modelUrl
      : typeof record.meshUrl === "string"
        ? record.meshUrl
        : "library://abstract";

  return {
    id:
      typeof record.id === "string"
        ? record.id
        : `object-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prompt:
      typeof record.prompt === "string"
        ? record.prompt
        : resolvedName,
    resolvedName,
    source: record.source === "scan" ? "scan" : "generate",
    scanResultId:
      typeof record.scanResultId === "string" ? record.scanResultId : undefined,
    tier: normalizeResolutionTier(record.tier),
    modelUrl,
    style: normalizeStylePreset(record.style),
    generationStatus: normalizeGenerationStatus(record.generationStatus),
    materializedAt: normalizeNumber(record.materializedAt, Date.now()),
    rotation: normalizeRotation(record.rotation),
    shape,
    semanticFamily:
      typeof record.semanticFamily === "string" ? record.semanticFamily : undefined,
    material: normalizeSpatialMaterial(record.material),
    color: typeof record.color === "string" ? record.color : "#EF9F27",
    animation: normalizeAnimationPreset(record.animation),
    position: normalizePosition(record.position),
    scale: normalizeVector(record.scale, [1, 1, 1]),
    intensity: normalizeNumber(record.intensity, 1),
    meshUrl: typeof record.meshUrl === "string" ? record.meshUrl : undefined,
    opacity: typeof record.opacity === "number" ? record.opacity : 1,
    materialOverrides:
      record.materialOverrides && typeof record.materialOverrides === "object"
        ? (record.materialOverrides as Record<string, unknown>)
        : undefined,
    anchorSection:
      typeof record.anchorSection === "string" ? record.anchorSection : undefined
  };
}

export const useYiiyaStore = create<YiiyaState>((set) => ({
  currentProjectId: createProjectId(),
  currentProjectSlug: createProjectSlug(),
  projectName: defaultProjectName,
  isGuest: false,
  isPro: false,
  creationGoal: "web",
  starterPromptId: null,
  canvasMode: "WEB",
  strategyMode: false,
  isListening: false,
  isInterpreting: false,
  transcript: "",
  interimTranscript: "",
  selectedElementId: null,
  selectedElements: [],
  hoveredElementId: null,
  cursorTarget: null,
  referenceImage: null,
  toastMessage: null,
  publishResult: null,
  saveStatus: "idle",
  lastSavedAt: null,
  activeBrief: null,
  lastFallbackPath: null,
  timelineSnapshots: [],
  activeTimelineSnapshotId: null,
  creationPathways,
  scanJob: null,
  themeState: defaultYiiyaTheme,
  sidebarCollapsed: true,
  exportTarget: "scene",
  sections: [],
  sceneObjects: [],
  blobState: defaultBlobState(),
  spatialAnchors: [],
  labControls: [],
  layers: initialLayers,
  logs: initialLogs,
  conversationHistory: [],
  undoStack: [],
  redoStack: [],
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
  setProjectName: (projectName) => set({ projectName }),
  renameProject: (projectName) =>
    set((state) => {
      const nextName = projectName.trim() || defaultProjectName;
      const oldName = state.projectName;

      return {
        undoStack: pushUndoSnapshot(state),
        redoStack: [],
        projectName: nextName,
        sections: state.sections.map((section) => {
          if (section.sectionType === "NAVBAR") {
            return {
              ...section,
              content: replaceKnownBrandValues(section.content, oldName, nextName, [
                "brand"
              ])
            };
          }

          if (section.sectionType === "HERO") {
            return {
              ...section,
              content: replaceKnownBrandValues(section.content, oldName, nextName, [
                "heading",
                "title"
              ])
            };
          }

          if (section.sectionType === "FOOTER") {
            return {
              ...section,
              content: replaceKnownBrandValues(section.content, oldName, nextName, [
                "brand"
              ])
            };
          }

          return {
            ...section,
            content: replaceKnownBrandValues(section.content, oldName, nextName)
          };
        }),
        logs: [...state.logs, createLog(`[CONTEXT]: Project renamed to ${nextName}.`)].slice(-40)
      };
    }),
  setGuest: (isGuest) => set({ isGuest }),
  setPro: (isPro) => set({ isPro }),
  setCreationGoal: (creationGoal) => set({ creationGoal }),
  setStarterPromptId: (starterPromptId) => set({ starterPromptId }),
  setCanvasMode: (canvasMode) => set({ canvasMode }),
  setStrategyMode: (strategyMode) => set({ strategyMode }),
  setCurrentProjectSlug: (currentProjectSlug) => set({ currentProjectSlug }),
  setListening: (isListening) => set({ isListening }),
  setInterpreting: (isInterpreting) => set({ isInterpreting }),
  setTranscript: (transcript) => set({ transcript }),
  setInterimTranscript: (interimTranscript) => set({ interimTranscript }),
  setSelectedElementId: (selectedElementId) => set({ selectedElementId }),
  setSelectedElements: (selectedElements) => set({ selectedElements }),
  setHoveredElementId: (hoveredElementId) => set({ hoveredElementId }),
  setCursorTarget: (cursorTarget) => set({ cursorTarget }),
  updateCursor3D: (scene) =>
    set((state) =>
      state.cursorTarget
        ? {
            cursorTarget: {
              ...state.cursorTarget,
              sceneObjectId: scene.sceneObjectId,
              scenePoint: scene.scenePoint,
              targetKind: scene.sceneObjectId
                ? "scene-object"
                : state.cursorTarget.targetKind === "scene-object"
                  ? "scene-empty"
                  : state.cursorTarget.targetKind,
              description:
                scene.sceneObjectId && state.sceneObjects.length > 0
                  ? state.sceneObjects.find((object) => object.id === scene.sceneObjectId)
                      ?.resolvedName ?? state.cursorTarget.description
                  : state.cursorTarget.description
            }
          }
        : state
    ),
  setReferenceImage: (referenceImage) => set({ referenceImage }),
  setToastMessage: (toastMessage) => set({ toastMessage }),
  setPublishResult: (publishResult) => set({ publishResult }),
  setSaveStatus: (saveStatus, savedAt) =>
    set({
      saveStatus,
        lastSavedAt: savedAt ?? (saveStatus === "saving" ? null : undefined)
    }),
  setActiveBrief: (activeBrief, fallbackPath) =>
    set({
      activeBrief,
      lastFallbackPath: fallbackPath ?? null
    }),
  setScanJob: (scanJob) => set({ scanJob }),
  pushTimelineSnapshot: (snapshot) =>
    set((state) => ({
      timelineSnapshots: [snapshot, ...state.timelineSnapshots].slice(0, 18),
      activeTimelineSnapshotId: snapshot.id
    })),
  restoreTimelineSnapshot: (snapshotId) =>
    set((state) => {
      const snapshot = state.timelineSnapshots.find((item) => item.id === snapshotId);

      if (!snapshot) {
        return state;
      }

      return {
        undoStack: pushUndoSnapshot(state),
        redoStack: [],
        sections: snapshot.sections,
        sceneObjects: snapshot.sceneObjects,
        layers: snapshot.layers,
        themeState: snapshot.themeState,
        blobState: snapshot.blobState,
        canvasMode: snapshot.canvasMode,
        activeBrief: snapshot.brief,
        activeTimelineSnapshotId: snapshot.id,
        logs: [...state.logs, createLog(`[TIMELINE]: Restored ${snapshot.label}.`)].slice(-40)
      };
    }),
  setThemeState: (themeState) =>
    set((state) => ({
      undoStack: pushUndoSnapshot(state),
      redoStack: [],
      themeState: mergeYiiyaTheme(state.themeState, themeState)
    })),
  addSection: (section) => {
    const id = `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sectionType = normalizeSectionType(section.sectionType);
    const nextSection: YiiyaSection = {
      id,
      sectionType,
      layoutVariant: normalizeLayoutVariant(section.layoutVariant, sectionType),
      theme: normalizeRecord(section.theme) as SectionTheme,
      content: normalizeRecord(section.content)
    };

    set((state) => ({
      undoStack: pushUndoSnapshot(state),
      redoStack: [],
      sections: [...state.sections, nextSection],
      layers: [
        ...state.layers,
        {
          id,
          name: `${nextSection.sectionType.toLowerCase()} section`,
          type: "section"
        }
      ]
    }));

    return nextSection;
  },
  removeSection: (sectionId) =>
    set((state) => ({
      undoStack: pushUndoSnapshot(state),
      redoStack: [],
      sections: state.sections.filter((section) => section.id !== sectionId),
      layers: state.layers.filter((layer) => layer.id !== sectionId),
      selectedElementId: null,
      selectedElements: [],
      logs: [...state.logs, createLog(`[CONTEXT]: Removed section ${sectionId}.`)].slice(-40)
    })),
  addSceneObject: (object) => {
    const id = `object-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextObject: SceneObject = {
      id,
      prompt:
        typeof object.prompt === "string"
          ? object.prompt
          : typeof object.resolvedName === "string"
            ? object.resolvedName
            : typeof object.shape === "string"
              ? object.shape
              : "abstract object",
      resolvedName:
        typeof object.resolvedName === "string"
          ? object.resolvedName
          : typeof object.shape === "string"
            ? object.shape
            : "abstract",
      source: object.source === "scan" ? "scan" : "generate",
      scanResultId:
        typeof object.scanResultId === "string" ? object.scanResultId : undefined,
      tier: normalizeResolutionTier(object.tier),
      modelUrl:
        typeof object.modelUrl === "string"
          ? object.modelUrl
          : typeof object.meshUrl === "string"
            ? object.meshUrl
            : "library://abstract",
      style: normalizeStylePreset(object.style),
      generationStatus: normalizeGenerationStatus(object.generationStatus),
      materializedAt: Date.now(),
      rotation: normalizeRotation(object.rotation),
      shape: typeof object.shape === "string" ? object.shape : "sphere",
      semanticFamily:
        typeof object.semanticFamily === "string" ? object.semanticFamily : undefined,
      material: normalizeSpatialMaterial(object.material),
      color: typeof object.color === "string" ? object.color : "#EF9F27",
      animation: normalizeAnimationPreset(object.animation),
      position: normalizePosition(object.position),
      scale: normalizeVector(object.scale, [1, 1, 1]),
      intensity: normalizeNumber(object.intensity, 1),
      meshUrl: typeof object.meshUrl === "string" ? object.meshUrl : undefined,
      opacity: 1,
      anchorSection:
        typeof object.anchorSection === "string" ? object.anchorSection : undefined
    };

    set((state) => ({
      undoStack: pushUndoSnapshot(state),
      redoStack: [],
      sceneObjects: [...state.sceneObjects, nextObject],
      layers: [
        ...state.layers,
        {
          id,
          name: `${nextObject.resolvedName} · ${nextObject.style}`,
          type: "mesh"
        }
      ]
    }));

    return nextObject;
  },
  morphBlob: (blobState) =>
    set((state) => ({
      undoStack: pushUndoSnapshot(state),
      redoStack: [],
      blobState: {
        targetShape: normalizeBlobTarget(blobState.targetShape ?? state.blobState.targetShape),
        formation: normalizeBlobFormation(blobState.formation ?? state.blobState.formation),
        distort: normalizeNumber(blobState.distort, state.blobState.distort),
        speed: normalizeNumber(blobState.speed, state.blobState.speed),
        aspectRatio: normalizeNumber(blobState.aspectRatio, state.blobState.aspectRatio),
        morphProgress: normalizeNumber(
          blobState.morphProgress,
          Math.min(1, state.blobState.morphProgress + 0.35)
        ),
        material: blobState.material
          ? normalizeSpatialMaterial(blobState.material)
          : state.blobState.material,
        glow: clampNumber(normalizeNumber(blobState.glow, state.blobState.glow), 0, 2),
        chaos: clampNumber(normalizeNumber(blobState.chaos, state.blobState.chaos), 0, 2),
        twist: clampNumber(normalizeNumber(blobState.twist, state.blobState.twist), -4, 4),
        particleDensity: clampNumber(
          normalizeNumber(blobState.particleDensity, state.blobState.particleDensity),
          1000,
          22000
        ),
        controlledByHand:
          typeof blobState.controlledByHand === "boolean"
            ? blobState.controlledByHand
            : state.blobState.controlledByHand,
        silhouette: normalizeSilhouette(blobState.silhouette) ?? state.blobState.silhouette
      }
    })),
  spawnControl: (control) =>
    set((state) => {
      const normalizedControl: LabControl = {
        id: control.id,
        label: control.label,
        kind: control.kind ?? "range",
        min: control.min,
        max: control.max,
        step: control.step,
        value: control.value,
        target: control.target,
        property: control.property
      };

      return {
        labControls: [
          ...state.labControls.filter((item) => item.id !== normalizedControl.id),
          normalizedControl
        ].slice(-8),
        logs: [...state.logs, createLog(`[LAB]: ${normalizedControl.label} ready.`)].slice(-40)
      };
    }),
  setControlValue: (id, value) =>
    set((state) => {
      const control = state.labControls.find((item) => item.id === id);

      if (!control) {
        return state;
      }

      const nextValue = clampNumber(value, control.min, control.max);
      const nextControls = state.labControls.map((item) =>
        item.id === id ? { ...item, value: nextValue } : item
      );
      const nextState: Partial<YiiyaState> = {
        labControls: nextControls
      };

      if (control.target === "blob") {
        nextState.blobState = {
          ...state.blobState,
          [control.property]: nextValue
        };
      }

      if (control.target === "theme" && control.property === "fontScale") {
        nextState.themeState = mergeYiiyaTheme(state.themeState, {
          fontScale: nextValue
        });
      }

      if (control.target === "theme" && control.property === "spacingMultiplier") {
        nextState.themeState = mergeYiiyaTheme(state.themeState, {
          spacingMultiplier: nextValue
        });
      }

      return {
        ...nextState,
        undoStack: pushUndoSnapshot(state),
        redoStack: []
      };
    }),
  addSpatialAnchor: (anchor) =>
    set((state) => ({
      spatialAnchors: [
        ...state.spatialAnchors.filter((item) => item.objectId !== anchor.objectId),
        anchor
      ]
    })),
  updateSceneObject: (objectId, updates) =>
    set((state) => {
      const targetId =
        objectId === "latest"
          ? state.sceneObjects[state.sceneObjects.length - 1]?.id
          : objectId;

      if (!targetId) {
        return state;
      }

      return {
        undoStack: pushUndoSnapshot(state),
        redoStack: [],
        sceneObjects: state.sceneObjects.map((object) =>
          object.id === targetId
            ? {
                ...object,
                ...updates,
                style:
                  updates.style !== undefined
                    ? normalizeStylePreset(updates.style)
                    : object.style,
                tier:
                  updates.tier !== undefined
                    ? normalizeResolutionTier(updates.tier)
                    : object.tier,
                generationStatus:
                  updates.generationStatus !== undefined
                    ? normalizeGenerationStatus(updates.generationStatus)
                    : object.generationStatus,
                material: updates.material
                  ? normalizeSpatialMaterial(updates.material)
                  : object.material,
                scale: updates.scale ?? object.scale,
                rotation: updates.rotation ?? object.rotation,
                materialOverrides: {
                  ...object.materialOverrides,
                  ...updates.materialOverrides
                }
              }
            : object
        )
      };
    }),
  updateSceneObjectLive: (objectId, updates) =>
    set((state) => {
      const targetId =
        objectId === "latest"
          ? state.sceneObjects[state.sceneObjects.length - 1]?.id
          : objectId;

      if (!targetId) {
        return state;
      }

      return {
        sceneObjects: state.sceneObjects.map((object) =>
          object.id === targetId
            ? {
                ...object,
                ...updates,
                style:
                  updates.style !== undefined
                    ? normalizeStylePreset(updates.style)
                    : object.style,
                tier:
                  updates.tier !== undefined
                    ? normalizeResolutionTier(updates.tier)
                    : object.tier,
                generationStatus:
                  updates.generationStatus !== undefined
                    ? normalizeGenerationStatus(updates.generationStatus)
                    : object.generationStatus,
                material: updates.material
                  ? normalizeSpatialMaterial(updates.material)
                  : object.material,
                scale: updates.scale ?? object.scale,
                rotation: updates.rotation ?? object.rotation,
                materialOverrides: {
                  ...object.materialOverrides,
                  ...updates.materialOverrides
                }
              }
            : object
        )
      };
    }),
  removeSceneObject: (objectId) =>
    set((state) => {
      const targetId =
        objectId === "latest"
          ? state.sceneObjects[state.sceneObjects.length - 1]?.id
          : objectId;
      const sceneObjects =
        objectId === "*"
          ? []
          : state.sceneObjects.filter((object) => object.id !== targetId);

      return {
        undoStack: pushUndoSnapshot(state),
        redoStack: [],
        sceneObjects,
        layers: state.layers.filter((layer) =>
          objectId === "*" ? layer.type !== "mesh" : layer.id !== targetId
        )
      };
    }),
  popUndo: () =>
    set((state) => {
      const snapshot = state.undoStack[state.undoStack.length - 1];

      if (!snapshot) {
        return {
          logs: [...state.logs, createLog("[SYSTEM]: Nothing to undo.")].slice(-40)
        };
      }

      return {
        projectName: snapshot.projectName,
        sections: snapshot.sections,
        sceneObjects: snapshot.sceneObjects,
        layers: snapshot.layers,
        themeState: snapshot.themeState,
        blobState: snapshot.blobState,
        spatialAnchors: snapshot.spatialAnchors,
        labControls: snapshot.labControls,
        selectedElementId: null,
        selectedElements: [],
        hoveredElementId: null,
        redoStack: [...state.redoStack, snapshotFromState(state)].slice(-20),
        undoStack: state.undoStack.slice(0, -1),
        logs: [...state.logs, createLog("[SYSTEM]: Undo restored previous state.")].slice(-40)
      };
    }),
  popRedo: () =>
    set((state) => {
      const snapshot = state.redoStack[state.redoStack.length - 1];

      if (!snapshot) {
        return {
          logs: [...state.logs, createLog("[SYSTEM]: Nothing to redo.")].slice(-40)
        };
      }

      return {
        projectName: snapshot.projectName,
        sections: snapshot.sections,
        sceneObjects: snapshot.sceneObjects,
        layers: snapshot.layers,
        themeState: snapshot.themeState,
        blobState: snapshot.blobState,
        spatialAnchors: snapshot.spatialAnchors,
        labControls: snapshot.labControls,
        selectedElementId: null,
        selectedElements: [],
        hoveredElementId: null,
        undoStack: [...state.undoStack, snapshotFromState(state)].slice(-20),
        redoStack: state.redoStack.slice(0, -1),
        logs: [...state.logs, createLog("[SYSTEM]: Redo restored next state.")].slice(-40)
      };
    }),
  updateElementContent: (elementId, value) =>
    set((state) => {
      const sectionIndex = sectionIndexFromElementId(elementId);
      const key = contentKeyFromElementId(elementId);

      if (sectionIndex < 0 || !key) {
        return state;
      }

      return {
        undoStack: pushUndoSnapshot(state),
        redoStack: [],
        sections: state.sections.map((section, index) =>
          index === sectionIndex
            ? {
                ...section,
                content: {
                  ...section.content,
                  [key]: value
                }
              }
            : section
        )
      };
    }),
  addLog: (label) =>
    set((state) => ({
      logs: [...state.logs, createLog(label)].slice(-40)
    })),
  addActionLogs: (actions) =>
    set((state) => ({
      logs: [
        ...state.logs,
        ...actions.map((action) => createLog(describeAction(action)))
      ].slice(-40)
    })),
  addMessage: (message) =>
    set((state) => ({
      conversationHistory: [...state.conversationHistory, message].slice(-5)
    })),
  loadProject: (project) =>
    set((state) => {
      const canvas = project.canvas_json;
      const theme = project.theme_json ?? project.themeState;
      const sections = canvas?.sections ?? project.sections ?? [];
      const sceneObjects = (canvas?.sceneObjects ?? project.sceneObjects ?? [])
        .map((object) => normalizeSceneObjectRecord(object))
        .filter((object): object is SceneObject => Boolean(object));
      const layers =
        canvas?.layers ??
        project.layers ??
        [
          ...sections.map((section) => ({
            id: section.id,
            name: `${section.sectionType.toLowerCase()} section`,
            type: "section" as const
          })),
          ...sceneObjects.map((object) => ({
            id: object.id,
            name: `${object.resolvedName} · ${object.style}`,
            type: "mesh" as const
          }))
        ];

      return {
        currentProjectId:
          project.currentProjectId ?? project.id ?? state.currentProjectId,
        projectName: project.projectName ?? state.projectName,
        sections,
        sceneObjects,
        layers,
        activeBrief: null,
        timelineSnapshots: [],
        activeTimelineSnapshotId: null,
        scanJob: null,
        blobState: defaultBlobState(),
        spatialAnchors: [],
        labControls: [],
        selectedElementId: null,
        selectedElements: [],
        hoveredElementId: null,
        referenceImage: null,
        themeState: mergeYiiyaTheme(defaultYiiyaTheme, theme ?? {}),
        logs: project.logLabel
          ? [...state.logs, createLog(project.logLabel)].slice(-40)
          : state.logs,
        undoStack: [],
        redoStack: []
      };
    }),
  resetProject: () =>
    set((state) => ({
      currentProjectId: createProjectId(),
      currentProjectSlug: createProjectSlug(),
      projectName: defaultProjectName,
      isListening: false,
      isInterpreting: false,
      creationGoal: "web",
      starterPromptId: null,
      canvasMode: "WEB",
      transcript: "",
      interimTranscript: "",
      selectedElementId: null,
      selectedElements: [],
      hoveredElementId: null,
      cursorTarget: null,
      referenceImage: null,
      toastMessage: null,
      publishResult: null,
      strategyMode: false,
      saveStatus: "idle",
      lastSavedAt: null,
      activeBrief: null,
      lastFallbackPath: null,
      timelineSnapshots: [],
      activeTimelineSnapshotId: null,
      scanJob: null,
      themeState: defaultYiiyaTheme,
      sections: [],
      sceneObjects: [],
      blobState: defaultBlobState(),
      spatialAnchors: [],
      labControls: [],
      layers: [],
      logs: [...state.logs, createLog("SYSTEM: New project initialized.")].slice(-40),
      conversationHistory: [],
      undoStack: [],
      redoStack: []
    })),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setExportTarget: (exportTarget) => set({ exportTarget })
}));
