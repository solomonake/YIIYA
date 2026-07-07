"use client";

import { FilesetResolver, InteractiveSegmenter } from "@mediapipe/tasks-vision";

// Google's public CDN + model bucket — free, no API key, same hosts every
// official MediaPipe web example points at. Fetched lazily on first use so
// desktop users who never open /capture never pay this download.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite";

let segmenterPromise: Promise<InteractiveSegmenter> | null = null;

function getSegmenter(): Promise<InteractiveSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((fileset) =>
      InteractiveSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        outputCategoryMask: true,
        outputConfidenceMasks: false
      })
    );
  }
  return segmenterPromise;
}

export type SegmentResult = {
  /** data:image/png;base64,... — the tapped object isolated on white, tightly cropped. */
  dataUrl: string;
  base64: string;
};

/**
 * Segments the object at a tapped point out of a live video frame or image,
 * composites it onto a white studio background (matching what the image-to-3D
 * providers expect), and tightly crops to its bounds.
 *
 * @param xNorm,yNorm tap position normalized to the source's own dimensions (0..1)
 */
export async function segmentAtPoint(
  source: HTMLVideoElement | HTMLImageElement,
  xNorm: number,
  yNorm: number
): Promise<SegmentResult> {
  const segmenter = await getSegmenter();
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!width || !height) throw new Error("Video not ready yet — try again in a moment.");

  const result = segmenter.segment(source, { keypoint: { x: xNorm, y: yNorm } });
  const mask = result.categoryMask;
  if (!mask) throw new Error("Segmentation produced no mask");

  const maskData = mask.getAsUint8Array();
  mask.close();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (maskData[i] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        const p = i * 4;
        frame.data[p] = 255;
        frame.data[p + 1] = 255;
        frame.data[p + 2] = 255;
      }
    }
  }
  ctx.putImageData(frame, 0, 0);

  if (maxX <= minX || maxY <= minY) {
    throw new Error("No object detected there — try tapping directly on it.");
  }

  // Crop to the mask bounds with a small margin, matching the centered,
  // isolated composition the generator's studio-photo prompt expects.
  const margin = Math.round(Math.max(maxX - minX, maxY - minY) * 0.12);
  const cx0 = Math.max(0, minX - margin);
  const cy0 = Math.max(0, minY - margin);
  const cx1 = Math.min(width, maxX + margin);
  const cy1 = Math.min(height, maxY + margin);
  const cropW = cx1 - cx0;
  const cropH = cy1 - cy0;

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) throw new Error("Canvas 2D context unavailable");
  cropCtx.fillStyle = "#ffffff";
  cropCtx.fillRect(0, 0, cropW, cropH);
  cropCtx.drawImage(canvas, cx0, cy0, cropW, cropH, 0, 0, cropW, cropH);

  const dataUrl = cropCanvas.toDataURL("image/png");
  return { dataUrl, base64: dataUrl.split(",")[1] };
}
