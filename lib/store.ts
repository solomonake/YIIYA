"use client";

import { create } from "zustand";
import {
  defaultYiiyaTheme,
  mergeYiiyaTheme,
  type YiiyaTheme
} from "@/lib/designSystem";
import { normalizeSpatialMaterial, type SpatialMaterial } from "@/lib/materials";
import type { PublishedProject } from "@/lib/published-project-types";
import { createProjectSlug } from "@/lib/project-slug";

export type Layer = {
  id: string;
  name: string;
  type: "site" | "scene" | "mesh" | "light" | "section";
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
  shape: string;
  material: SpatialMaterial;
  color: string;
  animation: string;
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
  distort: number;
  speed: number;
  aspectRatio: number;
  morphProgress: number;
  material: SpatialMaterial;
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
  dominantColor?: string;
  accentCandidate?: string;
  extractedMode?: "dark" | "light";
  imageMode?: "web" | "3d" | "hybrid";
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
        shape: unknown;
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
        shape: unknown;
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
        distort: unknown;
        speed: unknown;
        aspectRatio?: unknown;
        morphProgress?: unknown;
        material?: unknown;
        silhouette?: unknown;
      };
    }
  | {
      type: "LOAD_3D_MESH";
      payload: {
        url: unknown;
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
      type: "REMOVE_OBJECT";
      payload: { objectId: unknown };
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
  sections: YiiyaSection[];
  sceneObjects: SceneObject[];
  layers: Layer[];
  themeState: YiiyaTheme;
};

type YiiyaState = {
  currentProjectId: string;
  currentProjectSlug: string;
  projectName: string;
  isGuest: boolean;
  isPro: boolean;
  canvasMode: CanvasMode;
  strategyMode: boolean;
  isListening: boolean;
  isInterpreting: boolean;
  transcript: string;
  interimTranscript: string;
  selectedElementId: string | null;
  selectedElements: string[];
  hoveredElementId: string | null;
  referenceImage: ReferenceImage | null;
  toastMessage: string | null;
  publishResult: PublishedProject | null;
  saveStatus: "idle" | "saving" | "saved";
  lastSavedAt: string | null;
  themeState: YiiyaTheme;
  sidebarCollapsed: boolean;
  sections: YiiyaSection[];
  sceneObjects: SceneObject[];
  blobState: BlobState;
  spatialAnchors: SpatialAnchor[];
  layers: Layer[];
  logs: LogEntry[];
  conversationHistory: YiiyaMessage[];
  undoStack: UndoSnapshot[];
  setCurrentProjectId: (currentProjectId: string) => void;
  setProjectName: (projectName: string) => void;
  setGuest: (isGuest: boolean) => void;
  setPro: (isPro: boolean) => void;
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
  setReferenceImage: (referenceImage: ReferenceImage | null) => void;
  setToastMessage: (toastMessage: string | null) => void;
  setPublishResult: (publishResult: PublishedProject | null) => void;
  setSaveStatus: (status: "idle" | "saving" | "saved", savedAt?: string) => void;
  setThemeState: (themeState: Partial<YiiyaTheme>) => void;
  addSection: (section: {
    sectionType: unknown;
    layoutVariant?: unknown;
    theme?: unknown;
    content?: unknown;
  }) => YiiyaSection;
  addSceneObject: (object: {
    shape?: unknown;
    material?: unknown;
    color?: unknown;
    animation?: unknown;
    position?: unknown;
    scale?: unknown;
    intensity?: unknown;
    meshUrl?: unknown;
    anchorSection?: unknown;
  }) => SceneObject;
  morphBlob: (blobState: Partial<BlobState>) => void;
  addSpatialAnchor: (anchor: SpatialAnchor) => void;
  updateSceneObject: (
    objectId: string,
    updates: Partial<Omit<SceneObject, "material">> & { material?: unknown }
  ) => void;
  removeSceneObject: (objectId: string) => void;
  popUndo: () => void;
  addLog: (label: string) => void;
  addActionLogs: (actions: YiiyaAction[]) => void;
  addMessage: (message: YiiyaMessage) => void;
  loadProject: (project: SavedProjectState) => void;
  resetProject: () => void;
  toggleSidebar: () => void;
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
      sections: state.sections,
      sceneObjects: state.sceneObjects,
      layers: state.layers,
      themeState: state.themeState
    }
  ].slice(-20);
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

  if (action.type === "SET_MATERIAL") {
    return `[EXECUTE]: Applying ${String(action.payload.material)} material.`;
  }

  if (action.type === "RESHAPE_OBJECT") {
    return "[EXECUTE]: Reshaping spatial object.";
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

export const useYiiyaStore = create<YiiyaState>((set) => ({
  currentProjectId: createProjectId(),
  currentProjectSlug: createProjectSlug(),
  projectName: defaultProjectName,
  isGuest: false,
  isPro: false,
  canvasMode: "HYBRID",
  strategyMode: false,
  isListening: false,
  isInterpreting: false,
  transcript: "",
  interimTranscript: "",
  selectedElementId: null,
  selectedElements: [],
  hoveredElementId: null,
  referenceImage: null,
  toastMessage: null,
  publishResult: null,
  saveStatus: "idle",
  lastSavedAt: null,
  themeState: defaultYiiyaTheme,
  sidebarCollapsed: false,
  sections: [],
  sceneObjects: [],
  blobState: {
    targetShape: "sphere",
    distort: 0.5,
    speed: 1.8,
    aspectRatio: 1,
    morphProgress: 0,
    material: "carbon"
  },
  spatialAnchors: [],
  layers: initialLayers,
  logs: initialLogs,
  conversationHistory: [],
  undoStack: [],
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
  setProjectName: (projectName) => set({ projectName }),
  setGuest: (isGuest) => set({ isGuest }),
  setPro: (isPro) => set({ isPro }),
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
  setReferenceImage: (referenceImage) => set({ referenceImage }),
  setToastMessage: (toastMessage) => set({ toastMessage }),
  setPublishResult: (publishResult) => set({ publishResult }),
  setSaveStatus: (saveStatus, savedAt) =>
    set({
      saveStatus,
      lastSavedAt: savedAt ?? (saveStatus === "saving" ? null : undefined)
    }),
  setThemeState: (themeState) =>
    set((state) => ({
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
  addSceneObject: (object) => {
    const id = `object-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextObject: SceneObject = {
      id,
      shape: typeof object.shape === "string" ? object.shape : "sphere",
      material: normalizeSpatialMaterial(object.material),
      color: typeof object.color === "string" ? object.color : "#EF9F27",
      animation: typeof object.animation === "string" ? object.animation : "float",
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
      sceneObjects: [...state.sceneObjects, nextObject],
      layers: [
        ...state.layers,
        {
          id,
          name: `${nextObject.color} ${nextObject.shape}`,
          type: "mesh"
        }
      ]
    }));

    return nextObject;
  },
  morphBlob: (blobState) =>
    set((state) => ({
      blobState: {
        targetShape: normalizeBlobTarget(blobState.targetShape ?? state.blobState.targetShape),
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
        silhouette: normalizeSilhouette(blobState.silhouette) ?? state.blobState.silhouette
      }
    })),
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
        sceneObjects: state.sceneObjects.map((object) =>
          object.id === targetId
            ? {
                ...object,
                ...updates,
                material: updates.material
                  ? normalizeSpatialMaterial(updates.material)
                  : object.material,
                scale: updates.scale ?? object.scale,
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
        sections: snapshot.sections,
        sceneObjects: snapshot.sceneObjects,
        layers: snapshot.layers,
        themeState: snapshot.themeState,
        selectedElementId: null,
        selectedElements: [],
        hoveredElementId: null,
        undoStack: state.undoStack.slice(0, -1),
        logs: [...state.logs, createLog("[SYSTEM]: Undo restored previous state.")].slice(-40)
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
      const sceneObjects = canvas?.sceneObjects ?? project.sceneObjects ?? [];
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
            name: `${object.color} ${object.shape}`,
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
        blobState: {
          targetShape: "sphere",
          distort: 0.5,
          speed: 1.8,
          aspectRatio: 1,
          morphProgress: 0,
          material: "carbon"
        },
        spatialAnchors: [],
        selectedElementId: null,
        selectedElements: [],
        hoveredElementId: null,
        referenceImage: null,
        themeState: mergeYiiyaTheme(defaultYiiyaTheme, theme ?? {}),
        logs: project.logLabel
          ? [...state.logs, createLog(project.logLabel)].slice(-40)
          : state.logs
      };
    }),
  resetProject: () =>
    set((state) => ({
      currentProjectId: createProjectId(),
      currentProjectSlug: createProjectSlug(),
      projectName: defaultProjectName,
      isListening: false,
      isInterpreting: false,
      transcript: "",
      interimTranscript: "",
      selectedElementId: null,
      selectedElements: [],
      hoveredElementId: null,
      referenceImage: null,
      toastMessage: null,
      publishResult: null,
      strategyMode: false,
      saveStatus: "idle",
      lastSavedAt: null,
      themeState: defaultYiiyaTheme,
      sections: [],
      sceneObjects: [],
      blobState: {
        targetShape: "sphere",
        distort: 0.5,
        speed: 1.8,
        aspectRatio: 1,
        morphProgress: 0,
        material: "carbon"
      },
      spatialAnchors: [],
      layers: [],
      logs: [...state.logs, createLog("SYSTEM: New project initialized.")].slice(-40),
      conversationHistory: [],
      undoStack: []
    })),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}));
