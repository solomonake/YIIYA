"use client";

import { useEffect } from "react";
import { useYiiyaStore } from "@/lib/store";

function getWordAtPoint(x: number, y: number) {
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);

    if (!range) {
      return null;
    }

    const text = range.startContainer.textContent ?? "";
    const offset = range.startOffset;
    const before = text.slice(0, offset).match(/\S+$/)?.[0] ?? "";
    const after = text.slice(offset).match(/^\S+/)?.[0] ?? "";

    return before || after ? `${before}${after}` : null;
  }

  return null;
}

function classifyDomTarget(element: HTMLElement | null) {
  if (!element) {
    return "none" as const;
  }

  if (element.tagName === "IMG") {
    return "dom-image" as const;
  }

  if ((element.textContent ?? "").trim().length > 0) {
    return "dom-text" as const;
  }

  return "dom-empty" as const;
}

function describeDomTarget(
  element: HTMLElement | null,
  domTextContent: string | null,
  domElementId: string | null
) {
  if (!element) {
    return "open canvas";
  }

  if (domTextContent) {
    return `the word "${domTextContent}"`;
  }

  if (domElementId) {
    return `section ${domElementId}`;
  }

  return element.tagName.toLowerCase();
}

export function useCursorTracker() {
  const setCursorTarget = useYiiyaStore((state) => state.setCursorTarget);

  useEffect(() => {
    let lastFire = 0;

    const handler = (event: MouseEvent) => {
      const now = Date.now();

      if (now - lastFire < 50) {
        return;
      }

      lastFire = now;
      const element = event.target instanceof HTMLElement ? event.target : null;
      const domElement = element?.closest("[data-yiiya-id]") as HTMLElement | null;
      const domElementId = domElement?.dataset.yiiyaId ?? null;
      const domTextContent = getWordAtPoint(event.clientX, event.clientY);

      setCursorTarget({
        screenX: event.clientX,
        screenY: event.clientY,
        domElementId,
        domTextContent,
        sceneObjectId: null,
        scenePoint: null,
        targetKind: classifyDomTarget(element),
        description: describeDomTarget(element, domTextContent, domElementId)
      });
    };

    window.addEventListener("mousemove", handler, { passive: true });

    return () => window.removeEventListener("mousemove", handler);
  }, [setCursorTarget]);
}
