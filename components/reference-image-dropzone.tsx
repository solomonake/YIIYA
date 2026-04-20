"use client";

import { useEffect, useRef, useState } from "react";
import { useYiiyaStore } from "@/lib/store";

type ExtractedPalette = {
  dominantColor: string;
  accentCandidate: string;
  extractedMode: "dark" | "light";
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

  return {
    dominantColor: rgbToHex(dominant.r, dominant.g, dominant.b),
    accentCandidate: rgbToHex(accent.r, accent.g, accent.b),
    extractedMode: brightness < 128 ? "dark" : "light"
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

export function ReferenceImageDropzone() {
  const [isDraggingImage, setDraggingImage] = useState(false);
  const dragDepthRef = useRef(0);
  const setReferenceImage = useYiiyaStore((state) => state.setReferenceImage);
  const setThemeState = useYiiyaStore((state) => state.setThemeState);
  const addLog = useYiiyaStore((state) => state.addLog);

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
        const referenceImage = await readImageAsReference(image);
        const extractedPalette = await extractPalette(referenceImage.dataUrl);
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
        setReferenceImage({
          base64: referenceImage.base64,
          mediaType: referenceImage.mediaType,
          name: referenceImage.name,
          ...extractedPalette
        });
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
  }, [addLog, setReferenceImage, setThemeState]);

  if (!isDraggingImage) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/88 text-bone backdrop-blur-xl">
      <div className="rounded-full border border-amber/50 bg-[#11110f]/90 px-7 py-4 text-lg font-semibold shadow-[0_24px_90px_rgba(0,0,0,0.48)]">
        Drop your reference image.
      </div>
    </div>
  );
}
