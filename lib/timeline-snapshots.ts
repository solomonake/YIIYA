// @ts-nocheck
"use client";

import html2canvas from "html2canvas";
import { useYiiyaStore, type TimelineSnapshot } from "@/lib/store";

function getSceneCanvasImage() {
  const canvas = document.querySelector<HTMLCanvasElement>(
    "[data-yiiya-scene-canvas='true']"
  );

  if (!canvas) {
    return null;
  }

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function captureTimelineSnapshot(label: string, summary: string) {
  const store = useYiiyaStore.getState();
  const root = document.querySelector<HTMLElement>("[data-yiiya-publish-root]");
  let htmlCanvasImage: string | undefined;

  if (root) {
    try {
      const canvas = await html2canvas(root, {
        backgroundColor: null,
        scale: 1,
        useCORS: true
      });
      htmlCanvasImage = canvas.toDataURL("image/png");
    } catch {
      htmlCanvasImage = undefined;
    }
  }

  const clone = <T,>(value: T): T => {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value)) as T;
  };

  const snapshot: TimelineSnapshot = {
    id: `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    createdAt: new Date().toISOString(),
    summary,
    sections: clone(store.sections),
    sceneObjects: clone(store.sceneObjects),
    layers: clone(store.layers),
    themeState: clone(store.themeState),
    blobState: clone(store.blobState),
    canvasMode: store.canvasMode,
    brief: clone(store.activeBrief),
    htmlCanvasImage,
    sceneCanvasImage: getSceneCanvasImage()
  };

  store.pushTimelineSnapshot(snapshot);
}
