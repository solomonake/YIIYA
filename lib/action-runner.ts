"use client";

import { useYiiyaStore, type YiiyaAction } from "@/lib/store";
import { publishCurrentProject } from "@/lib/publish-project";
import {
  densityFromScale,
  themeFromVibe,
  type LayoutDensity,
  type YiiyaTheme
} from "@/lib/designSystem";

function numericStyleValue(value: string) {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function setElementValue(element: HTMLElement, property: string, value: unknown) {
  const stringValue = String(value);

  if (property === "content") {
    element.textContent = stringValue;
    return;
  }

  if (property === "backgroundColor") {
    element.style.backgroundColor = stringValue;
    return;
  }

  if (property === "color") {
    element.style.color = stringValue;
    return;
  }

  if (property === "fontSize") {
    element.style.fontSize = stringValue;
    return;
  }

  if (property === "borderRadius") {
    element.style.borderRadius = stringValue;
    return;
  }

  if (property === "padding") {
    element.style.padding = stringValue;
    return;
  }

  if (property === "textAlign") {
    element.style.textAlign = stringValue;
    return;
  }

  if (property === "justifyContent") {
    element.style.justifyContent = stringValue;
    return;
  }

  if (property === "alignItems") {
    element.style.alignItems = stringValue;
    return;
  }

  if (property === "marginInline") {
    element.style.marginInline = stringValue;
    return;
  }

  if (property === "transform") {
    element.style.transform = stringValue;
  }
}

function applyModifyElement(action: YiiyaAction) {
  if (action.type !== "MODIFY_ELEMENT") {
    return;
  }

  const { elementId, property, value, mode } = action.payload;

  if (typeof elementId !== "string" || typeof property !== "string") {
    useYiiyaStore
      .getState()
      .addLog("[SYSTEM]: MODIFY_ELEMENT missing elementId or property.");
    return;
  }

  const element = document.querySelector<HTMLElement>(
    `[data-yiiya-id="${CSS.escape(elementId)}"]`
  );

  if (!element) {
    useYiiyaStore.getState().addLog(`[SYSTEM]: Element not found: ${elementId}.`);
    return;
  }

  if (
    property !== "content" &&
    property !== "backgroundColor" &&
    property !== "color" &&
    property !== "fontSize" &&
    property !== "borderRadius" &&
    property !== "padding" &&
    property !== "textAlign" &&
    property !== "justifyContent" &&
    property !== "alignItems" &&
    property !== "marginInline" &&
    property !== "transform"
  ) {
    useYiiyaStore.getState().addLog(`[SYSTEM]: Unsupported property: ${property}.`);
    return;
  }

  if (
    mode === "multiply" &&
    (property === "fontSize" ||
      property === "borderRadius" ||
      property === "padding")
  ) {
    const currentValue = window.getComputedStyle(element)[property];
    const numericValue = numericStyleValue(currentValue);
    const multiplier =
      typeof value === "number" ? value : Number.parseFloat(String(value));

    if (numericValue && Number.isFinite(multiplier)) {
      setElementValue(element, property, `${numericValue * multiplier}px`);
      return;
    }
  }

  if (
    mode === "increment" &&
    (property === "fontSize" ||
      property === "borderRadius" ||
      property === "padding")
  ) {
    const currentValue = window.getComputedStyle(element)[property];
    const numericValue = numericStyleValue(currentValue);
    const increment =
      typeof value === "number" ? value : Number.parseFloat(String(value));

    if (numericValue !== null && Number.isFinite(increment)) {
      setElementValue(element, property, `${numericValue + increment}px`);
      return;
    }
  }

  setElementValue(element, property, value);
}

function applyAddSection(action: YiiyaAction) {
  if (action.type !== "ADD_SECTION") {
    return;
  }

  useYiiyaStore.getState().addSection({
    sectionType: action.payload.sectionType,
    layoutVariant: action.payload.layoutVariant,
    theme: action.payload.theme,
    content: action.payload.content
  });
}

function positionFromAnchorSection(anchorSection: unknown) {
  if (typeof anchorSection !== "string") {
    return undefined;
  }

  const element = document.querySelector<HTMLElement>(
    `[data-yiiya-id="${CSS.escape(anchorSection)}"]`
  );

  if (!element) {
    return undefined;
  }

  const rect = element.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const y = Math.max(-2, Math.min(3, (window.innerHeight / 2 - midpoint) / 180 + 1.2));

  return [0, y, 0] as [number, number, number];
}

function applyAdd3DObject(action: YiiyaAction) {
  if (action.type !== "ADD_3D_OBJECT" && action.type !== "ADD_SPATIAL_OBJECT") {
    return;
  }

  const store = useYiiyaStore.getState();

  if (store.canvasMode === "WEB") {
    store.setCanvasMode("HYBRID");
    store.addLog("SYSTEM: Mode switched to HYBRID — 3D object detected.");
  }

  store.addSceneObject({
    ...action.payload,
    position:
      positionFromAnchorSection(action.payload.anchorSection) ??
      action.payload.position
  });
}

function objectIdFromValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : "latest";
}

function numericOverride(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function blobTargetFromValue(value: unknown) {
  if (
    value === "sphere" ||
    value === "bottle" ||
    value === "cube" ||
    value === "organic" ||
    value === "crystal"
  ) {
    return value;
  }

  return undefined;
}

function applyMorphBlob(action: YiiyaAction) {
  if (action.type !== "MORPH_BLOB") {
    return;
  }

  useYiiyaStore.getState().morphBlob({
    targetShape: blobTargetFromValue(action.payload.targetShape),
    distort: numericOverride(action.payload.distort),
    speed: numericOverride(action.payload.speed)
  });
}

function applySetMaterial(action: YiiyaAction) {
  if (action.type !== "SET_MATERIAL") {
    return;
  }

  const materialOverrides: Record<string, unknown> = {};

  for (const key of ["metalness", "roughness", "transmission", "emissive"] as const) {
    const value = action.payload[key];

    if (value !== undefined) {
      materialOverrides[key] = value;
    }
  }

  useYiiyaStore.getState().updateSceneObject(objectIdFromValue(action.payload.objectId), {
    material:
      typeof action.payload.material === "string"
        ? action.payload.material.toLowerCase()
        : undefined,
    color: typeof action.payload.color === "string" ? action.payload.color : undefined,
    materialOverrides
  });
}

function applyReshapeObject(action: YiiyaAction) {
  if (action.type !== "RESHAPE_OBJECT") {
    return;
  }

  const objectId = objectIdFromValue(action.payload.objectId);
  const currentObject =
    objectId === "latest"
      ? useYiiyaStore.getState().sceneObjects.at(-1)
      : useYiiyaStore
          .getState()
          .sceneObjects.find((object) => object.id === objectId);

  if (!currentObject) {
    return;
  }

  useYiiyaStore.getState().updateSceneObject(objectId, {
    scale: [
      numericOverride(action.payload.scaleX) ?? currentObject.scale[0],
      numericOverride(action.payload.scaleY) ?? currentObject.scale[1],
      numericOverride(action.payload.scaleZ) ?? currentObject.scale[2]
    ]
  });
}

function applyRemoveObject(action: YiiyaAction) {
  if (action.type !== "REMOVE_OBJECT") {
    return;
  }

  useYiiyaStore.getState().removeSceneObject(objectIdFromValue(action.payload.objectId));
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function layoutDensityFromValue(value: unknown): LayoutDensity | undefined {
  if (value === "compact" || value === "balanced" || value === "spacious") {
    return value;
  }

  return undefined;
}

function applySetGlobalTheme(action: YiiyaAction) {
  if (action.type !== "SET_GLOBAL_THEME") {
    return;
  }

  const palette = stringArray(action.payload.palette);
  const partialTheme: Partial<YiiyaTheme> = {
    spacingMultiplier: toNumber(action.payload.spacingMultiplier),
    borderRadius: toNumber(action.payload.borderRadius),
    primaryAccent:
      typeof action.payload.primaryAccent === "string"
        ? action.payload.primaryAccent
        : palette[2],
    fontScale: toNumber(action.payload.fontScale),
    layoutDensity: layoutDensityFromValue(action.payload.layoutDensity),
    background: palette[0],
    foreground: palette[1],
    palette,
    fontWeight: toNumber(action.payload.fontWeight)
  };

  useYiiyaStore.getState().setThemeState(partialTheme);
}

function applySyncBrandToImage(action: YiiyaAction) {
  if (action.type !== "SYNC_BRAND_TO_IMAGE") {
    return;
  }

  const palette = stringArray(action.payload.palette);
  const visualTone =
    typeof action.payload.visualTone === "string"
      ? action.payload.visualTone
      : "";
  const fontWeights = Array.isArray(action.payload.fontWeights)
    ? action.payload.fontWeights
    : [];
  const firstWeight = fontWeights.find(
    (weight): weight is number => typeof weight === "number"
  );

  useYiiyaStore.getState().setThemeState({
    ...themeFromVibe(visualTone),
    background: palette[0],
    foreground: palette[1],
    primaryAccent: palette[2],
    palette,
    fontWeight: firstWeight
  });
}

function applyAdjustDensity(action: YiiyaAction) {
  if (action.type !== "ADJUST_DENSITY") {
    return;
  }

  const scale = toNumber(action.payload.scale);

  if (!scale) {
    return;
  }

  useYiiyaStore.getState().setThemeState({
    spacingMultiplier: Math.min(2, Math.max(0.5, scale)),
    layoutDensity: densityFromScale(scale)
  });
}

function applyChangeTheme(action: YiiyaAction) {
  if (action.type !== "CHANGE_THEME") {
    return;
  }

  const { property, value } = action.payload;

  if (typeof property !== "string") {
    useYiiyaStore.getState().addLog("[SYSTEM]: CHANGE_THEME missing property.");
    return;
  }

  const sections = document.querySelectorAll<HTMLElement>(
    "[data-yiiya-publish-root] section"
  );
  const palette = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  const stringValue = String(value);

  if (property === "palette" && palette.length > 0) {
    const [background, text, accent] = palette;

    sections.forEach((section) => {
      if (background) {
        section.style.backgroundColor = background;
      }

      if (text) {
        section.style.color = text;
      }
    });

    if (accent) {
      document
        .querySelectorAll<HTMLElement>(
          "[data-yiiya-id*='cta'], [data-yiiya-id*='submit']"
        )
        .forEach((element) => {
          element.style.backgroundColor = accent;
        });
    }

    return;
  }

  sections.forEach((section) => {
    if (property === "background" || property === "backgroundColor") {
      section.style.backgroundColor = stringValue;
    }

    if (
      property === "color" ||
      property === "textColor" ||
      property === "textColour" ||
      property === "text colour"
    ) {
      section.style.color = stringValue;
    }
  });
}

function canvasModeFromValue(value: unknown) {
  if (value === "WEB" || value === "3D" || value === "HYBRID") {
    return value;
  }

  return undefined;
}

export function runYiiyaActions(actions: YiiyaAction[]) {
  for (const action of actions) {
    if (action.type === "RESET_PROJECT") {
      useYiiyaStore.getState().resetProject();
    }

    if (action.type === "SET_MODE") {
      const mode = canvasModeFromValue(action.payload.mode);

      if (mode) {
        useYiiyaStore.getState().setCanvasMode(mode);
      }
    }

    if (action.type === "UNDO") {
      useYiiyaStore.getState().popUndo();
    }

    if (action.type === "ADD_SECTION") {
      applyAddSection(action);
    }

    if (action.type === "ADD_3D_OBJECT") {
      applyAdd3DObject(action);
    }

    if (action.type === "ADD_SPATIAL_OBJECT") {
      applyAdd3DObject(action);
    }

    if (action.type === "MORPH_BLOB") {
      applyMorphBlob(action);
    }

    if (action.type === "SET_MATERIAL") {
      applySetMaterial(action);
    }

    if (action.type === "RESHAPE_OBJECT") {
      applyReshapeObject(action);
    }

    if (action.type === "REMOVE_OBJECT") {
      applyRemoveObject(action);
    }

    if (action.type === "SET_GLOBAL_THEME") {
      applySetGlobalTheme(action);
    }

    if (action.type === "SYNC_BRAND_TO_IMAGE") {
      applySyncBrandToImage(action);
    }

    if (action.type === "ADJUST_DENSITY") {
      applyAdjustDensity(action);
    }

    if (action.type === "PUBLISH") {
      void publishCurrentProject();
    }
  }

  window.requestAnimationFrame(() => {
    for (const action of actions) {
      if (action.type === "MODIFY_ELEMENT") {
        applyModifyElement(action);
      }

      if (action.type === "CHANGE_THEME") {
        applyChangeTheme(action);
      }
    }
  });
}
