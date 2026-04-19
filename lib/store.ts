"use client";

import { create } from "zustand";
import {
  defaultYiiyaTheme,
  mergeYiiyaTheme,
  type YiiyaTheme
} from "@/lib/designSystem";

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

export type SectionType = "HERO" | "ABOUT" | "FEATURES" | "CONTACT";

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
  theme: SectionTheme;
  content: SectionContent;
};

export type SceneObject = {
  id: string;
  shape: string;
  material: "Glass" | "Chrome" | "Matte";
  color: string;
  animation: string;
  position: [number, number, number];
};

export type ReferenceImage = {
  base64: string;
  mediaType: string;
  name: string;
};

export type YiiyaAction =
  | {
      type: "ADD_SECTION";
      payload: {
        sectionType: unknown;
        theme?: unknown;
        content?: unknown;
      };
    }
  | {
      type: "ADD_3D_OBJECT";
      payload: {
        shape: unknown;
        color: unknown;
        animation: unknown;
        position: unknown;
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
    };

type YiiyaState = {
  projectName: string;
  isListening: boolean;
  isInterpreting: boolean;
  interimTranscript: string;
  selectedElementId: string | null;
  hoveredElementId: string | null;
  referenceImage: ReferenceImage | null;
  toastMessage: string | null;
  themeState: YiiyaTheme;
  sidebarCollapsed: boolean;
  sections: YiiyaSection[];
  sceneObjects: SceneObject[];
  layers: Layer[];
  logs: LogEntry[];
  setProjectName: (projectName: string) => void;
  setListening: (isListening: boolean) => void;
  setInterpreting: (isInterpreting: boolean) => void;
  setInterimTranscript: (interimTranscript: string) => void;
  setSelectedElementId: (selectedElementId: string | null) => void;
  setHoveredElementId: (hoveredElementId: string | null) => void;
  setReferenceImage: (referenceImage: ReferenceImage | null) => void;
  setToastMessage: (toastMessage: string | null) => void;
  setThemeState: (themeState: Partial<YiiyaTheme>) => void;
  addSection: (section: {
    sectionType: unknown;
    theme?: unknown;
    content?: unknown;
  }) => YiiyaSection;
  addSceneObject: (object: {
    shape?: unknown;
    material?: unknown;
    color?: unknown;
    animation?: unknown;
    position?: unknown;
  }) => SceneObject;
  addLog: (label: string) => void;
  addActionLogs: (actions: YiiyaAction[]) => void;
  toggleSidebar: () => void;
};

const initialLayers: Layer[] = [];

const initialLogs: LogEntry[] = [
  { id: "log-1", label: "SYSTEM: Waiting for input.", timestamp: "--:--:--" }
];

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

    return `COMPILE: Injecting ${sectionType}_Section_v2.`;
  }

  if (action.type === "ADD_SPATIAL_OBJECT" || action.type === "ADD_3D_OBJECT") {
    const shape =
      typeof action.payload.shape === "string" ? action.payload.shape : "object";
    const material =
      "material" in action.payload && typeof action.payload.material === "string"
        ? action.payload.material
        : "Matte";

    return `SPATIAL: Mounting ${material}_${shape}.`;
  }

  if (action.type === "SET_GLOBAL_THEME") {
    const density =
      typeof action.payload.layoutDensity === "string"
        ? action.payload.layoutDensity
        : "token";

    return `THEME: Syncing global ${density} system.`;
  }

  if (action.type === "SYNC_BRAND_TO_IMAGE") {
    const tone =
      typeof action.payload.visualTone === "string"
        ? action.payload.visualTone
        : "reference";

    return `VISION: Brand image mapped to '${tone}'.`;
  }

  if (action.type === "ADJUST_DENSITY") {
    return `DENSITY: Scaling layout to ${String(action.payload.scale)}.`;
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

    return `MODIFY: ${elementId} -> ${property}.`;
  }

  if (action.type === "CHANGE_THEME") {
    const property =
      typeof action.payload.property === "string"
        ? action.payload.property
        : "theme";

    return `THEME: Applying legacy ${property}.`;
  }

  return "PUBLISH: Generating public artifact.";
}

function normalizeSectionType(sectionType: unknown): SectionType {
  if (typeof sectionType !== "string") {
    return "HERO";
  }

  const normalized = sectionType.toUpperCase();

  if (
    normalized === "HERO" ||
    normalized === "ABOUT" ||
    normalized === "FEATURES" ||
    normalized === "CONTACT"
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

function normalizeMaterial(material: unknown): SceneObject["material"] {
  if (typeof material !== "string") {
    return "Matte";
  }

  const normalized = material.toLowerCase();

  if (normalized === "glass") {
    return "Glass";
  }

  if (normalized === "chrome") {
    return "Chrome";
  }

  return "Matte";
}

export const useYiiyaStore = create<YiiyaState>((set) => ({
  projectName: "yiiya.app — new project",
  isListening: false,
  isInterpreting: false,
  interimTranscript: "",
  selectedElementId: null,
  hoveredElementId: null,
  referenceImage: null,
  toastMessage: null,
  themeState: defaultYiiyaTheme,
  sidebarCollapsed: false,
  sections: [],
  sceneObjects: [],
  layers: initialLayers,
  logs: initialLogs,
  setProjectName: (projectName) => set({ projectName }),
  setListening: (isListening) => set({ isListening }),
  setInterpreting: (isInterpreting) => set({ isInterpreting }),
  setInterimTranscript: (interimTranscript) => set({ interimTranscript }),
  setSelectedElementId: (selectedElementId) => set({ selectedElementId }),
  setHoveredElementId: (hoveredElementId) => set({ hoveredElementId }),
  setReferenceImage: (referenceImage) => set({ referenceImage }),
  setToastMessage: (toastMessage) => set({ toastMessage }),
  setThemeState: (themeState) =>
    set((state) => ({
      themeState: mergeYiiyaTheme(state.themeState, themeState)
    })),
  addSection: (section) => {
    const id = `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextSection: YiiyaSection = {
      id,
      sectionType: normalizeSectionType(section.sectionType),
      theme: normalizeRecord(section.theme) as SectionTheme,
      content: normalizeRecord(section.content)
    };

    set((state) => ({
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
      material: normalizeMaterial(object.material),
      color: typeof object.color === "string" ? object.color : "#EF9F27",
      animation: typeof object.animation === "string" ? object.animation : "float",
      position: normalizePosition(object.position)
    };

    set((state) => ({
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
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}));
