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
  }
}

function applyModifyElement(action: YiiyaAction) {
  if (action.type !== "MODIFY_ELEMENT") {
    return;
  }

  const { elementId, property, value, mode } = action.payload;

  if (typeof elementId !== "string" || typeof property !== "string") {
    useYiiyaStore.getState().addLog("MODIFY_ELEMENT missing elementId or property");
    return;
  }

  const element = document.querySelector<HTMLElement>(
    `[data-yiiya-id="${CSS.escape(elementId)}"]`
  );

  if (!element) {
    useYiiyaStore.getState().addLog(`Element not found: ${elementId}`);
    return;
  }

  if (
    property !== "content" &&
    property !== "backgroundColor" &&
    property !== "color" &&
    property !== "fontSize" &&
    property !== "borderRadius" &&
    property !== "padding"
  ) {
    useYiiyaStore.getState().addLog(`Unsupported property: ${property}`);
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
    theme: action.payload.theme,
    content: action.payload.content
  });
}

function applyAdd3DObject(action: YiiyaAction) {
  if (action.type !== "ADD_3D_OBJECT" && action.type !== "ADD_SPATIAL_OBJECT") {
    return;
  }

  useYiiyaStore.getState().addSceneObject(action.payload);
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
    useYiiyaStore.getState().addLog("CHANGE_THEME missing property");
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

export function runYiiyaActions(actions: YiiyaAction[]) {
  for (const action of actions) {
    if (action.type === "ADD_SECTION") {
      applyAddSection(action);
    }

    if (action.type === "ADD_3D_OBJECT") {
      applyAdd3DObject(action);
    }

    if (action.type === "ADD_SPATIAL_OBJECT") {
      applyAdd3DObject(action);
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
