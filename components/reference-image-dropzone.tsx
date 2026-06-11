"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useYiiyaStore,
  type ReferenceImage,
} from "@/lib/store";
import { runTranscriptThroughYiiya } from "@/lib/use-speech-interpreter";

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

      samples.push({
        r: pixel[0] ?? 0,
        g: pixel[1] ?? 0,
        b: pixel[2] ?? 0,
      });
    }
  }

  const average = samples.reduce(
    (acc, sample) => ({
      r: acc.r + sample.r,
      g: acc.g + sample.g,
      b: acc.b + sample.b,
    }),
    { r: 0, g: 0, b: 0 },
  );
  const dominant = {
    r: average.r / samples.length,
    g: average.g / samples.length,
    b: average.b / samples.length,
  };
  const brightness =
    dominant.r * 0.299 + dominant.g * 0.587 + dominant.b * 0.114;
  const accent = samples.reduce((best, sample) =>
    saturation(sample.r, sample.g, sample.b) >
    saturation(best.r, best.g, best.b)
      ? sample
      : best,
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
          height: (maxY - minY) / height,
        }
      : { x: 0.18, y: 0.12, width: 0.64, height: 0.76 };

  return {
    dominantColor: rgbToHex(dominant.r, dominant.g, dominant.b),
    accentCandidate: rgbToHex(accent.r, accent.g, accent.b),
    extractedMode: brightness < 128 ? "dark" : "light",
    aspectRatio: Math.max(
      0.3,
      Math.min(3, silhouette.height / Math.max(0.1, silhouette.width)),
    ),
    silhouette,
  };
}

function readImageAsReference(file: File) {
  return new Promise<{
    base64: string;
    mediaType: string;
    name: string;
    dataUrl: string;
  }>((resolve, reject) => {
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
        dataUrl: result,
      });
    };

    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

export function ReferenceImageDropzone() {
  const [isDraggingImage, setDraggingImage] = useState(false);
  const [isScanning, setScanning] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeLane = useYiiyaStore((state) => state.activeLane);
  const setActiveLane = useYiiyaStore((state) => state.setActiveLane);
  const setReferenceImage = useYiiyaStore((state) => state.setReferenceImage);
  const setThemeState = useYiiyaStore((state) => state.setThemeState);
  const addLog = useYiiyaStore((state) => state.addLog);
  const morphBlob = useYiiyaStore((state) => state.morphBlob);
  const triggerLabel =
    activeLane === "cad"
      ? "↑ CAD Reference"
      : activeLane === "scan"
        ? "↑ Mesh Reference"
        : "↑ Model Reference";

  const applyPalette = useCallback(
    (extractedPalette: ExtractedPalette) => {
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
          extractedPalette.accentCandidate,
        ],
      });
      addLog(
        "SYSTEM: Theme extracted from reference image — applying palette.",
      );
    },
    [addLog, setThemeState],
  );

  const processImage = useCallback(
    async (image: File) => {
      setScanning(true);

      try {
        const referenceImage = await readImageAsReference(image);
        const extractedPalette = await extractPalette(referenceImage.dataUrl);
        const resolvedLane = activeLane === "scan" ? "mesh" : activeLane;
        const referencePayload: ReferenceImage = {
          base64: referenceImage.base64,
          mediaType: referenceImage.mediaType,
          name: referenceImage.name,
          previewUrl: referenceImage.dataUrl,
          ...extractedPalette,
          imageMode: "3d",
        };

        if (activeLane === "scan") {
          addLog(
            "[VISION]: Still images route into mesh or CAD generation, so Yiiya is switching back to mesh preview.",
          );
          setActiveLane("mesh");
        }

        setReferenceImage(referencePayload);
        applyPalette(extractedPalette);

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
          silhouette: extractedPalette.silhouette,
        });

        addLog(
          resolvedLane === "cad"
            ? "[VISION]: CAD lane — extracting hard-surface intent from the reference."
            : "[VISION]: Mesh lane — extracting form and material intent from the reference.",
        );

        await runTranscriptThroughYiiya(
          resolvedLane === "cad"
            ? "Turn this reference image into a bounded CAD-ready hard-surface concept with named parts and editable exports."
            : "Turn this reference image into a clean 3D asset with a fast preview and Blender-ready handoff.",
        );
        addLog("[VISION]: Analysis complete.");
      } finally {
        setScanning(false);
      }
    },
    [
      activeLane,
      addLog,
      applyPalette,
      morphBlob,
      setActiveLane,
      setReferenceImage,
    ],
  );

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
        file.type.startsWith("image/"),
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
          `[SYSTEM]: ${error instanceof Error ? error.message : "Unable to read image."}`,
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
  }, [addLog, processImage]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = Array.from(event.target.files ?? []).find((file) =>
      file.type.startsWith("image/"),
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
        `[SYSTEM]: ${error instanceof Error ? error.message : "Unable to read image."}`,
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
