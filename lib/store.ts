"use client";

/**
 * YIIYA 3D Studio — Zustand store
 * Pure 3D spatial state. No website sections, no layout layers.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GeneratedAsset, StyleDNA, ThreeDBrief, ReferenceImageInput } from "@/lib/interpret-pipeline";
import type { MaterialOverride } from "@/lib/scene/local-edit";
import type { SpatialMaterial } from "@/lib/materials";
import type {
  AnimationPreset,
  CursorTarget,
  GenerationStatus,
  ResolutionTier,
  StylePreset
} from "@/lib/scene/types";
import { createStageSlice, type StageSlice } from "@/lib/scene/stage-slice";

// ─── Scene object (for R3F viewport) ─────────────────────────────────────────

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
  physicsBody?: "fixed" | "dynamic" | "kinematicPosition";
  mass?: number;
};

export type SpatialAnchor = {
  objectId: string;
  elementId: string;
  placement: "behind" | "left" | "right" | "above" | "center";
  worldPosition: [number, number, number];
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
};

export type ReferenceImage = {
  base64: string;
  mediaType: string;
  name: string;
  previewUrl?: string;
  /** Extra segmented views from a video walk-around, ordered [left, back] — unlocks the multi-view provider. */
  additionalViews?: Array<{ base64: string; mediaType: string }>;
};

export type YiiyaMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LogEntry = {
  id: string;
  label: string;
  timestamp: string;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** A paused generation waiting on the user's answer (ambiguity gate). */
export type PendingClarify = {
  question: string;
  options: string[];
  /** The free Pollinations studio photo of the Director's best guess, if any. */
  previewImage: string | null;
  /** The transcript that triggered the gate — resubmitted with the answer appended. */
  transcript: string;
};

// ─── Actions (3D only) ────────────────────────────────────────────────────────

export type YiiyaAction =
  | { type: "ADD_3D_OBJECT"; payload: {
      prompt?: unknown; resolvedName?: unknown; tier?: unknown; modelUrl?: unknown;
      style?: unknown; generationStatus?: unknown; shape: unknown; semanticFamily?: unknown;
      material?: unknown; color?: unknown; animation?: unknown; position?: unknown;
      scale?: unknown; intensity?: unknown; physicsBody?: unknown; mass?: unknown;
    };
  }
  | { type: "LOAD_3D_MESH"; payload: { objectId: string; meshUrl: string; triangleCount?: number } }
  | { type: "MORPH_BLOB"; payload: { targetShape?: unknown; distort?: unknown; speed?: unknown; formation?: unknown } }
  | { type: "UPDATE_MATERIAL"; payload: { objectId: string; material: unknown; color?: string } }
  | { type: "MOVE_OBJECT"; payload: { objectId: string; position: [number, number, number] } }
  | { type: "ROTATE_OBJECT"; payload: { objectId: string; rotation: [number, number, number] } }
  | { type: "SCALE_OBJECT"; payload: { objectId: string; scale: [number, number, number] } }
  | { type: "REMOVE_OBJECT"; payload: { objectId: string } }
  | { type: "CLEAR_SCENE" }
  | { type: "SET_STYLE_DNA"; payload: StyleDNA }
  | { type: "SET_ASSET_BRIEF"; payload: ThreeDBrief }
  | { type: "ASSET_READY"; payload: GeneratedAsset };

// ─── Store ────────────────────────────────────────────────────────────────────

export type YiiyaStore = StageSlice & {
  // 3D scene
  sceneObjects: SceneObject[];
  blobState: BlobState;
  spatialAnchors: SpatialAnchor[];
  selectedObjectId: string | null;

  // Generated assets tray
  generatedAssets: GeneratedAsset[];
  activeAssetId: string | null;

  // Session state
  sessionStyleDNA: StyleDNA | null;
  activeBrief: ThreeDBrief | null;
  referenceImage: ReferenceImage | null;
  conversationHistory: YiiyaMessage[];

  // UI state
  isListening: boolean;
  isInterpreting: boolean;
  interimTranscript: string;
  latestQuestion: string | null;
  logs: LogEntry[];
  assetLogs: Record<string, LogEntry[]>;
  /** Local (client-captured) thumbnail data URLs, keyed by local asset id.
   *  Works with no Vercel Blob / Supabase — powers the in-session tray previews. */
  assetPosters: Record<string, string>;
  generatingAssetId: string | null;
  rightPanelOpen: boolean;
  leftPanelOpen: boolean;
  cursorTarget: CursorTarget | null;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  projectName: string;
  pendingClarify: PendingClarify | null;
  /** A substantive edit awaiting the user's OK before spending a paid regen. */
  pendingEditConfirm: { transcript: string; assetName: string } | null;
  /** The free reference photo the current/last generation is building from. */
  groundingPreviewUrl: string | null;
  /** Daily free-generation quota surfaced by the server (null = unknown/exempt). */
  generationsRemaining: number | null;
  generationsLimit: number | null;
  /** True when the active asset's GLB failed to load (e.g. an expired provider URL). */
  glbLoadFailed: boolean;

  // Actions
  addSceneObject: (obj: Omit<SceneObject, "id" | "materializedAt">) => string;
  removeSceneObject: (id: string) => void;
  updateSceneObject: (id: string, patch: Partial<SceneObject>) => void;
  clearScene: () => void;
  selectObject: (id: string | null) => void;
  setBlobState: (patch: Partial<BlobState>) => void;
  addGeneratedAsset: (asset: GeneratedAsset) => void;
  setActiveAsset: (id: string | null) => void;
  applyLocalMaterialEdit: (id: string, patch: MaterialOverride, scaleFactor?: number) => void;
  setSessionStyleDNA: (dna: StyleDNA | null) => void;
  setActiveBrief: (brief: ThreeDBrief | null) => void;
  setReferenceImage: (img: ReferenceImage | null) => void;
  addConversationMessage: (msg: YiiyaMessage) => void;
  setIsListening: (v: boolean) => void;
  setIsInterpreting: (v: boolean) => void;
  setInterimTranscript: (v: string) => void;
  setLatestQuestion: (v: string | null) => void;
  addLog: (label: string) => void;
  addAssetLog: (assetId: string, label: string) => void;
  setAssetPoster: (assetId: string, dataUrl: string) => void;
  setGeneratingAssetId: (id: string | null) => void;
  clearLogs: () => void;
  setRightPanelOpen: (v: boolean) => void;
  setLeftPanelOpen: (v: boolean) => void;
  setCursorTarget: (t: CursorTarget | null) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setProjectName: (name: string) => void;
  setPendingClarify: (c: PendingClarify | null) => void;
  setPendingEditConfirm: (c: { transcript: string; assetName: string } | null) => void;
  setGroundingPreviewUrl: (url: string | null) => void;
  setGenerationQuota: (remaining: number | null, limit: number | null) => void;
  setGlbLoadFailed: (failed: boolean) => void;
  applyAction: (action: YiiyaAction) => void;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_BLOB: BlobState = {
  targetShape: "sphere",
  formation: "sphere",
  distort: 0.4,
  speed: 1.2,
  aspectRatio: 1,
  morphProgress: 0,
  material: "glass",
  glow: 0.3,
  chaos: 0.2,
  twist: 0,
  particleDensity: 1,
  controlledByHand: false
};

// ─── Store factory ────────────────────────────────────────────────────────────

export const useYiiyaStore = create<YiiyaStore>()(
  persist(
    (set, get, _api) => ({
  ...createStageSlice(set, get),

  // 3D scene
  sceneObjects: [],
  blobState: DEFAULT_BLOB,
  spatialAnchors: [],
  selectedObjectId: null,

  // Generated assets
  generatedAssets: [],
  activeAssetId: null,

  // Session
  sessionStyleDNA: null,
  activeBrief: null,
  referenceImage: null,
  conversationHistory: [],

  // UI
  isListening: false,
  isInterpreting: false,
  interimTranscript: "",
  latestQuestion: null,
  logs: [],
  assetLogs: {},
  assetPosters: {},
  generatingAssetId: null,
  rightPanelOpen: false,
  leftPanelOpen: true,
  cursorTarget: null,
  saveStatus: "idle",
  lastSavedAt: null,
  projectName: "Untitled 3D Project",
  pendingClarify: null,
  pendingEditConfirm: null,
  groundingPreviewUrl: null,
  generationsRemaining: null,
  generationsLimit: null,
  glbLoadFailed: false,

  // Scene object methods
  addSceneObject: (obj) => {
    const id = `obj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set(s => ({ sceneObjects: [...s.sceneObjects, { ...obj, id, materializedAt: Date.now() } as SceneObject] }));
    return id;
  },

  removeSceneObject: (id) => set(s => ({ sceneObjects: s.sceneObjects.filter(o => o.id !== id) })),

  updateSceneObject: (id, patch) => set(s => ({
    sceneObjects: s.sceneObjects.map(o => o.id === id ? { ...o, ...patch } : o)
  })),

  clearScene: () => set({ sceneObjects: [], generatedAssets: [], activeAssetId: null, spatialAnchors: [] }),

  selectObject: (id) => set({ selectedObjectId: id }),

  setBlobState: (patch) => set(s => ({ blobState: { ...s.blobState, ...patch } })),

  // Generated assets
  addGeneratedAsset: (asset) => set(s => ({
    generatedAssets: [...s.generatedAssets, asset],
    activeAssetId: asset.id
  })),

  setActiveAsset: (id) => set({ activeAssetId: id }),

  // Fold a local material/scale tweak into the active asset. Merges onto any
  // prior override (successive edits stack) and multiplies relative scale.
  applyLocalMaterialEdit: (id, patch, scaleFactor) => set(s => ({
    generatedAssets: s.generatedAssets.map(a => {
      if (a.id !== id) return a;
      const prev = a.materialOverride ?? {};
      const nextScale = scaleFactor ? (prev.scale ?? 1) * scaleFactor : prev.scale;
      return {
        ...a,
        materialOverride: {
          ...prev,
          ...patch,
          ...(nextScale !== undefined ? { scale: nextScale } : {})
        }
      };
    })
  })),

  // Session
  setSessionStyleDNA: (dna) => set({ sessionStyleDNA: dna }),
  setActiveBrief: (brief) => set({ activeBrief: brief }),
  setReferenceImage: (img) => set({ referenceImage: img }),

  addConversationMessage: (msg) => set(s => ({
    conversationHistory: [...s.conversationHistory.slice(-9), msg]
  })),

  // UI
  setIsListening: (v) => set({ isListening: v }),
  setIsInterpreting: (v) => set({ isInterpreting: v }),
  setInterimTranscript: (v) => set({ interimTranscript: v }),
  setLatestQuestion: (v) => set({ latestQuestion: v }),

  addLog: (label) => set(s => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      label,
      timestamp: new Date().toISOString()
    };
    const assetId = s.generatingAssetId;
    return {
      logs: [...s.logs.slice(-199), entry],
      ...(assetId ? {
        assetLogs: {
          ...s.assetLogs,
          [assetId]: [...(s.assetLogs[assetId] ?? []).slice(-199), entry]
        }
      } : {})
    };
  }),

  addAssetLog: (assetId, label) => set(s => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      label,
      timestamp: new Date().toISOString()
    };
    return {
      assetLogs: {
        ...s.assetLogs,
        [assetId]: [...(s.assetLogs[assetId] ?? []).slice(-199), entry]
      }
    };
  }),

  setAssetPoster: (assetId, dataUrl) => set(s => ({
    assetPosters: { ...s.assetPosters, [assetId]: dataUrl }
  })),

  setGeneratingAssetId: (id) => set({ generatingAssetId: id }),

  clearLogs: () => set({ logs: [] }),

  setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
  setLeftPanelOpen: (v) => set({ leftPanelOpen: v }),
  setCursorTarget: (t) => set({ cursorTarget: t }),
  setSaveStatus: (s) => set({ saveStatus: s }),
  setProjectName: (name) => set({ projectName: name }),
  setPendingClarify: (c) => set({ pendingClarify: c }),
  setPendingEditConfirm: (c) => set({ pendingEditConfirm: c }),
  setGroundingPreviewUrl: (url) => set({ groundingPreviewUrl: url }),
  setGenerationQuota: (remaining, limit) => set({ generationsRemaining: remaining, generationsLimit: limit }),
  setGlbLoadFailed: (failed) => set({ glbLoadFailed: failed }),

  // Action dispatcher (for pipeline → store bridge)
  applyAction: (action) => {
    const { addSceneObject, updateSceneObject, removeSceneObject, clearScene, setBlobState, addGeneratedAsset, setSessionStyleDNA, setActiveBrief } = get();
    switch (action.type) {
      case "ADD_3D_OBJECT": {
        const p = action.payload;
        addSceneObject({
          prompt: String(p.prompt ?? ""),
          resolvedName: String(p.resolvedName ?? "object"),
          source: "generate",
          tier: (p.tier as ResolutionTier) ?? "preview",
          modelUrl: String(p.modelUrl ?? ""),
          style: (p.style as StylePreset) ?? "pbr",
          generationStatus: (p.generationStatus as GenerationStatus) ?? "idle",
          rotation: [0, 0, 0],
          shape: String(p.shape ?? "sphere"),
          semanticFamily: typeof p.semanticFamily === "string" ? p.semanticFamily : undefined,
          material: (p.material as SpatialMaterial) ?? "clay",
          color: String(p.color ?? "#808080"),
          animation: (p.animation as AnimationPreset) ?? "none",
          position: Array.isArray(p.position) ? p.position as [number, number, number] : [0, 0, 0],
          scale: Array.isArray(p.scale) ? p.scale as [number, number, number] : [1, 1, 1],
          intensity: Number(p.intensity ?? 1),
          physicsBody: (p.physicsBody as SceneObject["physicsBody"]) ?? undefined,
          mass: typeof p.mass === "number" ? p.mass : undefined
        });
        break;
      }
      case "LOAD_3D_MESH":
        updateSceneObject(action.payload.objectId, { meshUrl: action.payload.meshUrl });
        break;
      case "MORPH_BLOB":
        setBlobState(action.payload as Partial<BlobState>);
        break;
      case "UPDATE_MATERIAL":
        updateSceneObject(action.payload.objectId, {
          material: action.payload.material as SpatialMaterial,
          ...(action.payload.color ? { color: action.payload.color } : {})
        });
        break;
      case "MOVE_OBJECT":
        updateSceneObject(action.payload.objectId, { position: action.payload.position });
        break;
      case "ROTATE_OBJECT":
        updateSceneObject(action.payload.objectId, { rotation: action.payload.rotation });
        break;
      case "SCALE_OBJECT":
        updateSceneObject(action.payload.objectId, { scale: action.payload.scale });
        break;
      case "REMOVE_OBJECT":
        removeSceneObject(action.payload.objectId);
        break;
      case "CLEAR_SCENE":
        clearScene();
        break;
      case "SET_STYLE_DNA":
        setSessionStyleDNA(action.payload);
        break;
      case "SET_ASSET_BRIEF":
        setActiveBrief(action.payload);
        break;
      case "ASSET_READY":
        addGeneratedAsset(action.payload);
        break;
    }
  }
    }),
    {
      name: "yiiya-studio-session",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Next.js server-renders this "use client" store once for the initial
      // HTML using its bare default state (no localStorage on the server).
      // Without skipHydration, zustand/persist restores localStorage
      // SYNCHRONOUSLY during client store creation — so a returning visitor's
      // client-side first render shows their saved logs/assets while the
      // server's render is always empty, a genuine hydration mismatch (not a
      // false positive). skipHydration defers restoration to an explicit
      // rehydrate() call from a useEffect (see hooks/use-store-hydration.ts),
      // so both the server render and the client's FIRST render agree on the
      // default state; the persisted data swaps in one tick later.
      skipHydration: true,
      // Only persist what makes "resume where I left off" meaningful and
      // safe. Generated GLB URLs are durable (Vercel Blob or our own proxy),
      // so a restored asset tray still resolves after a refresh. Ephemeral
      // UI/runtime state (isListening, isInterpreting, referenceImage,
      // cursorTarget, saveStatus) is deliberately excluded — a stale
      // "listening" or "processing" flag surviving a refresh would just be
      // confusing, and referenceImage as base64 could bloat localStorage.
      partialize: (state) => ({
        generatedAssets: state.generatedAssets,
        activeAssetId: state.activeAssetId,
        logs: state.logs.slice(-100),
        assetLogs: Object.fromEntries(
          Object.entries(state.assetLogs).map(([k, v]) => [k, v.slice(-100)])
        ),
        // Persist thumbnails only for the most recent assets — compact JPEGs,
        // but base64 in localStorage adds up, so cap to the tail we still show.
        assetPosters: Object.fromEntries(
          state.generatedAssets
            .slice(-12)
            .map((a) => [a.id, state.assetPosters[a.id]])
            .filter(([, v]) => typeof v === "string")
        ),
        conversationHistory: state.conversationHistory,
        projectName: state.projectName,
        sessionStyleDNA: state.sessionStyleDNA,
        activeBrief: state.activeBrief
      })
    }
  )
);
