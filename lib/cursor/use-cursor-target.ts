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
  const setSelectedElementId = useYiiyaStore((state) => state.setSelectedElementId);
  const setSelectedElements = useYiiyaStore((state) => state.setSelectedElements);
  const addLog = useYiiyaStore((state) => state.addLog);

  useEffect(() => {
    let lastFire = 0;
    let circleSamples: Array<{ x: number; y: number; t: number }> = [];
    let lastCircleLock = 0;

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
      const currentCursorTarget = useYiiyaStore.getState().cursorTarget;
      const existingSceneObjectId = domElementId
        ? null
        : currentCursorTarget?.sceneObjectId ?? null;
      const existingScenePoint = domElementId
        ? null
        : currentCursorTarget?.scenePoint ?? null;
      const targetKind = existingSceneObjectId
        ? ("scene-object" as const)
        : classifyDomTarget(element);
      const description = existingSceneObjectId
        ? currentCursorTarget?.description ?? "spatial object"
        : describeDomTarget(element, domTextContent, domElementId);

      setCursorTarget({
        screenX: event.clientX,
        screenY: event.clientY,
        domElementId,
        domTextContent,
        sceneObjectId: existingSceneObjectId,
        scenePoint: existingScenePoint,
        targetKind,
        description
      });

      if (!useYiiyaStore.getState().isListening) {
        circleSamples = [];
        return;
      }

      circleSamples = [
        ...circleSamples.filter((sample) => now - sample.t < 1400),
        { x: event.clientX, y: event.clientY, t: now }
      ].slice(-36);

      if (now - lastCircleLock < 1400 || circleSamples.length < 10) {
        return;
      }

      const first = circleSamples[0];
      const last = circleSamples[circleSamples.length - 1];
      const distanceToStart = Math.hypot(last.x - first.x, last.y - first.y);
      const pathLength = circleSamples.slice(1).reduce((total, sample, index) => {
        const previous = circleSamples[index];

        return total + Math.hypot(sample.x - previous.x, sample.y - previous.y);
      }, 0);
      const xs = circleSamples.map((sample) => sample.x);
      const ys = circleSamples.map((sample) => sample.y);
      const boundsWidth = Math.max(...xs) - Math.min(...xs);
      const boundsHeight = Math.max(...ys) - Math.min(...ys);
      const circledDomElementId = domElementId ?? currentCursorTarget?.domElementId ?? null;
      const circledSceneObjectId = existingSceneObjectId ?? currentCursorTarget?.sceneObjectId ?? null;

      if (
        distanceToStart < 54 &&
        pathLength > 240 &&
        boundsWidth > 42 &&
        boundsHeight > 42 &&
        (circledDomElementId || circledSceneObjectId)
      ) {
        lastCircleLock = now;
        circleSamples = [];

        if (circledDomElementId) {
          setSelectedElementId(circledDomElementId);
          setSelectedElements([circledDomElementId]);
        }

        addLog(
          `[CONTEXT]: Circled ${circledDomElementId ?? circledSceneObjectId} for the next voice edit.`
        );
      }
    };

    window.addEventListener("mousemove", handler, { passive: true });

    return () => window.removeEventListener("mousemove", handler);
  }, [addLog, setCursorTarget, setSelectedElementId, setSelectedElements]);
}
