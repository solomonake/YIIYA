"use client";

import { useYiiyaStore, type YiiyaAction } from "@/lib/store";
import { publishCurrentProject } from "@/lib/publish-project";

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

  const { elementId, property, value } = action.payload;

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
  if (action.type !== "ADD_3D_OBJECT") {
    return;
  }

  useYiiyaStore.getState().addSceneObject(action.payload);
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
