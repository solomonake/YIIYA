"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { captureTimelineSnapshot } from "@/lib/timeline-snapshots";
import { runYiiyaActions } from "@/lib/action-runner";
import { useYiiyaStore, type ReferenceImage, type YiiyaAction } from "@/lib/store";
import type { CreativeBrief } from "@/lib/creative-brief";

type ExtractedPalette = {
  dominantColor: string;
  accentCandidate: string;
  extractedMode: "dark" | "light";
  aspectRatio: number;
  silhouette: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function componentToHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function saturation(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max === 0) {
    return 0;
  }

  return (max - min) / max;
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode image"));
    image.src = dataUrl;
  });
}

async function extractPalette(dataUrl: string): Promise<ExtractedPalette> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context || width <= 0 || height <= 0) {
    throw new Error("Unable to sample image");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const samples: Array<{ r: number; g: number; b: number }> = [];

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const x = Math.min(width - 1, Math.floor(((col + 0.5) / 5) * width));
      const y = Math.min(height - 1, Math.floor(((row + 0.5) / 5) * height));
      const pixel = context.getImageData(x, y, 1, 1).data;
      const r = pixel[0] ?? 0;
      const g = pixel[1] ?? 0;
      const b = pixel[2] ?? 0;

      samples.push({ r, g, b });
    }
  }

  const average = samples.reduce(
    (acc, sample) => ({
      r: acc.r + sample.r,
      g: acc.g + sample.g,
      b: acc.b + sample.b
    }),
    { r: 0, g: 0, b: 0 }
  );
  const dominant = {
    r: average.r / samples.length,
    g: average.g / samples.length,
    b: average.b / samples.length
  };
  const brightness =
    dominant.r * 0.299 + dominant.g * 0.587 + dominant.b * 0.114;
  const accent = samples.reduce((best, sample) =>
    saturation(sample.r, sample.g, sample.b) >
    saturation(best.r, best.g, best.b)
      ? sample
      : best
  );

  const imageData = context.getImageData(0, 0, width, height).data;
  const threshold = brightness < 128 ? brightness + 28 : brightness - 28;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 80))) {
    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 80))) {
      const index = (y * width + x) * 4;
      const r = imageData[index] ?? 0;
      const g = imageData[index + 1] ?? 0;
      const b = imageData[index + 2] ?? 0;
      const pixelBrightness = r * 0.299 + g * 0.587 + b * 0.114;
      const differs =
        brightness < 128
          ? pixelBrightness > threshold
          : pixelBrightness < threshold;

      if (differs) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const silhouette =
    maxX > minX && maxY > minY
      ? {
          x: minX / width,
          y: minY / height,
          width: (maxX - minX) / width,
          height: (maxY - minY) / height
        }
      : { x: 0.18, y: 0.12, width: 0.64, height: 0.76 };

  return {
    dominantColor: rgbToHex(dominant.r, dominant.g, dominant.b),
    accentCandidate: rgbToHex(accent.r, accent.g, accent.b),
    extractedMode: brightness < 128 ? "dark" : "light",
    aspectRatio: Math.max(0.3, Math.min(3, silhouette.height / Math.max(0.1, silhouette.width))),
    silhouette
  };
}

function readImageAsReference(file: File) {
  return new Promise<{
    base64: string;
    mediaType: string;
    name: string;
    dataUrl: string;
  }>(
    (resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result;

        if (typeof result !== "string") {
          reject(new Error("Unable to read image"));
          return;
        }

        const [, base64 = ""] = result.split(",");
        resolve({
          base64,
          mediaType: file.type || "image/png",
          name: file.name,
          dataUrl: result
        });
      };

      reader.onerror = () => reject(new Error("Unable to read image"));
      reader.readAsDataURL(file);
    }
  );
}

function isYiiyaActionArray(value: unknown): value is YiiyaAction[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const action = item as { type?: unknown; payload?: unknown };

      return typeof action.type === "string" && typeof action.payload === "object";
    })
  );
}

function isInterpretPayload(
  value: unknown
): value is { actions: YiiyaAction[]; qa_log?: string[] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { actions?: unknown; qa_log?: unknown };

  return (
    isYiiyaActionArray(payload.actions) &&
    (payload.qa_log === undefined ||
      (Array.isArray(payload.qa_log) &&
        payload.qa_log.every((item) => typeof item === "string")))
  );
}

function buildCurrentCanvasJson() {
  const state = useYiiyaStore.getState();

  return {
    projectId: state.currentProjectId,
    projectSlug: state.currentProjectSlug,
    projectName: state.projectName,
    selectedElementId: state.selectedElementId,
    sections: state.sections,
    sceneObjects: state.sceneObjects,
    themeState: state.themeState,
    layers: state.layers
  };
}

export function ReferenceImageDropzone() {
  const [isDraggingImage, setDraggingImage] = useState(false);
  const [isScanning, setScanning] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setReferenceImage = useYiiyaStore((state) => state.setReferenceImage);
  const setThemeState = useYiiyaStore((state) => state.setThemeState);
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const addLog = useYiiyaStore((state) => state.addLog);
  const addActionLogs = useYiiyaStore((state) => state.addActionLogs);
  const addMessage = useYiiyaStore((state) => state.addMessage);
  const morphBlob = useYiiyaStore((state) => state.morphBlob);
  const setActiveBrief = useYiiyaStore((state) => state.setActiveBrief);
  const creationGoal = useYiiyaStore((state) => state.creationGoal);
  const starterPromptId = useYiiyaStore((state) => state.starterPromptId);
  const scanSession = useYiiyaStore((state) => state.scanSession);
  const triggerLabel =
    canvasMode === "WEB"
      ? "↑ Website Shot"
      : canvasMode === "3D"
        ? "↑ Object Image"
        : "↑ Reference";

  const applyPalette = useCallback((extractedPalette: ExtractedPalette) => {
    const foreground =
      extractedPalette.extractedMode === "dark" ? "#FFFFFF" : "#000000";

    setThemeState({
      background: extractedPalette.dominantColor,
      foreground,
      mutedForeground:
        extractedPalette.extractedMode === "dark"
          ? "rgba(255, 255, 255, 0.68)"
          : "rgba(0, 0, 0, 0.68)",
      surface:
        extractedPalette.extractedMode === "dark"
          ? "rgba(255, 255, 255, 0.06)"
          : "rgba(255, 255, 255, 0.72)",
      border:
        extractedPalette.extractedMode === "dark"
          ? "rgba(255, 255, 255, 0.14)"
          : "rgba(0, 0, 0, 0.14)",
      primaryAccent: extractedPalette.accentCandidate,
      palette: [
        extractedPalette.dominantColor,
        foreground,
        extractedPalette.accentCandidate
      ]
    });
    addLog("SYSTEM: Theme extracted from reference image — applying palette.");
  }, [addLog, setThemeState]);

  const sendVisionInterpret = useCallback(async (
    referenceImage: ReferenceImage,
    imageMode: "web" | "3d"
  ) => {
    const { previewUrl: _previewUrl, ...serverReferenceImage } = referenceImage;
    const transcript =
      imageMode === "web"
        ? "Generate a full landing page inspired by this reference image."
        : "Analyze this reference image and reshape the blob toward its primary object.";
    const currentCanvasJson = buildCurrentCanvasJson();
    const response = await fetch("/api/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        activeElementId: useYiiyaStore.getState().selectedElementId,
        currentScene: currentCanvasJson,
        current_canvas_json: currentCanvasJson,
        history: useYiiyaStore.getState().conversationHistory.slice(-5),
        referenceImage: { ...serverReferenceImage, imageMode },
        image_mode: imageMode,
        creationGoal,
        canvasMode,
        starterPromptId,
        scanSessionId: scanSession?.id ?? null
      })
    });

    if (!response.ok) {
      throw new Error(`Vision request failed with ${response.status}`);
    }

    const payload: unknown = await response.json();

    if (!isInterpretPayload(payload)) {
      throw new Error("Vision response was not an action payload");
    }

    runYiiyaActions(payload.actions);
    const briefPayload = payload as {
      brief?: CreativeBrief | null;
      fallbackPath?: string | null;
    };
    if (briefPayload.brief) {
      setActiveBrief(briefPayload.brief, briefPayload.fallbackPath ?? null);
    }
    addActionLogs(payload.actions);
    payload.qa_log?.forEach((log) => addLog(log));
    addMessage({
      role: "assistant",
      content:
        imageMode === "web"
          ? "Generated image-inspired web layout."
          : "Analyzed image geometry for 3D blob."
    });
    await captureTimelineSnapshot(
      imageMode === "web" ? "reference web" : "reference 3d",
      briefPayload.brief?.summary ??
        (imageMode === "web"
          ? "Generated image-inspired web layout."
          : "Analyzed image geometry for 3D blob.")
    );
  }, [
    addActionLogs,
    addLog,
    addMessage,
    canvasMode,
    creationGoal,
    scanSession,
    setActiveBrief,
    starterPromptId
  ]);

  const processImage = useCallback(async (image: File) => {
    setScanning(true);
    window.setTimeout(() => {
      setScanning(false);
      addLog("[VISION]: Analysis complete.");
    }, 1500);

    const referenceImage = await readImageAsReference(image);
    const extractedPalette = await extractPalette(referenceImage.dataUrl);
    const mode = canvasMode;
    const referencePayload: ReferenceImage = {
      base64: referenceImage.base64,
      mediaType: referenceImage.mediaType,
      name: referenceImage.name,
      previewUrl: referenceImage.dataUrl,
      ...extractedPalette,
      imageMode: mode === "3D" ? "3d" : mode === "WEB" ? "web" : "hybrid"
    };

    setReferenceImage(referencePayload);

    morphBlob({
      targetShape:
        extractedPalette.aspectRatio > 1.45
          ? "bottle"
          : extractedPalette.aspectRatio < 0.78
            ? "cube"
            : "organic",
      distort: 0.38,
      speed: 2.15,
      aspectRatio: extractedPalette.aspectRatio,
      morphProgress: 0.55,
      material: "glass",
      silhouette: extractedPalette.silhouette
    });

    if (mode === "WEB") {
      addLog("[VISION]: Web mode — extracting design DNA...");
      applyPalette(extractedPalette);
      await sendVisionInterpret(referencePayload, "web");
      return;
    }

    if (mode === "3D") {
      addLog("[VISION]: 3D mode — analyzing object geometry...");
      await sendVisionInterpret(referencePayload, "3d");
      return;
    }

    addLog("[VISION]: Hybrid mode — applying to both layers...");
    applyPalette(extractedPalette);
    await Promise.all([
      sendVisionInterpret(referencePayload, "web"),
      sendVisionInterpret(referencePayload, "3d")
    ]);
  }, [
    addLog,
    applyPalette,
    canvasMode,
    sendVisionInterpret,
    setReferenceImage,
    morphBlob
  ]);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setDraggingImage(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

      if (dragDepthRef.current === 0) {
        setDraggingImage(false);
      }
    };

    const handleDrop = async (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = 0;
      setDraggingImage(false);

      const image = Array.from(event.dataTransfer?.files ?? []).find((file) =>
        file.type.startsWith("image/")
      );

      if (!image) {
        addLog("[SYSTEM]: Drop ignored: no image file found.");
        return;
      }

      try {
        await processImage(image);
        addLog(`[SYSTEM]: Reference image attached: ${image.name}.`);
      } catch (error) {
        addLog(
          `[SYSTEM]: ${error instanceof Error ? error.message : "Unable to read image."}`
        );
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [addLog, canvasMode, processImage]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = Array.from(event.target.files ?? []).find((file) =>
      file.type.startsWith("image/")
    );

    event.target.value = "";

    if (!image) {
      return;
    }

    try {
      await processImage(image);
      addLog(`[SYSTEM]: Reference image attached: ${image.name}.`);
    } catch (error) {
      addLog(
        `[SYSTEM]: ${error instanceof Error ? error.message : "Unable to read image."}`
      );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="fixed bottom-5 left-5 z-30 rounded-full border border-terminalBorder bg-[#070707]/88 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] text-white/65 backdrop-blur transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
      >
        {triggerLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
      {isScanning ? (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden bg-ink/28">
          <span className="yiiya-scan-line absolute left-0 h-px w-full bg-amber shadow-[0_0_22px_rgba(239,159,39,0.9)]" />
        </div>
      ) : null}
      {isDraggingImage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/88 text-bone backdrop-blur-xl">
          <div className="rounded-full border border-amber/50 bg-[#11110f]/90 px-7 py-4 text-lg font-semibold shadow-[0_24px_90px_rgba(0,0,0,0.48)]">
            Drop your reference image.
          </div>
        </div>
      ) : null}
    </>
  );
}
