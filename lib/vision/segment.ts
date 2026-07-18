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

export type SegmentResultWithCentroid = SegmentResult & {
  /** Mask centroid in the source's normalized coordinates — the seed point for tracking the same object into the next frame. */
  centroidXNorm: number;
  centroidYNorm: number;
};

type SegmentSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

function sourceDimensions(source: SegmentSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLCanvasElement) return { width: source.width, height: source.height };
  return { width: source.naturalWidth, height: source.naturalHeight };
}

/**
 * Segments the object at a tapped point out of a live video frame or image,
 * composites it onto a white studio background (matching what the image-to-3D
 * providers expect), and tightly crops to its bounds.
 *
 * @param xNorm,yNorm tap position normalized to the source's own dimensions (0..1)
 */
export async function segmentAtPoint(
  source: SegmentSource,
  xNorm: number,
  yNorm: number
): Promise<SegmentResult> {
  return segmentAtPointWithCentroid(source, xNorm, yNorm);
}

/**
 * Same as segmentAtPoint, but also reports the mask centroid so callers can
 * track the object across video frames (lib/vision/video-frames.ts).
 */
export async function segmentAtPointWithCentroid(
  source: SegmentSource,
  xNorm: number,
  yNorm: number
): Promise<SegmentResultWithCentroid> {
  const segmenter = await getSegmenter();
  const { width, height } = sourceDimensions(source);
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
  let sumX = 0;
  let sumY = 0;
  let maskCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (maskData[i] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        maskCount++;
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

  // Composite the isolated subject onto a SQUARE white canvas, centered, with
  // even padding. Image-to-3D models (Hunyuan3D / TRELLIS / Tripo) are trained
  // on centered, square, padded product shots — a tight or off-center
  // rectangular crop makes them misjudge proportions and clip the silhouette,
  // which is a big part of why single-tap captures come back distorted.
  // Squaring + ~30% padding is the cheapest lever on reconstruction quality.
  const subjectW = maxX - minX;
  const subjectH = maxY - minY;
  const side = Math.max(1, Math.round(Math.max(subjectW, subjectH) * 1.3));

  const outCanvas = document.createElement("canvas");
  outCanvas.width = side;
  outCanvas.height = side;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2D context unavailable");
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, side, side);
  const dx = Math.round((side - subjectW) / 2);
  const dy = Math.round((side - subjectH) / 2);
  outCtx.drawImage(canvas, minX, minY, subjectW, subjectH, dx, dy, subjectW, subjectH);

  const dataUrl = outCanvas.toDataURL("image/png");
  return {
    dataUrl,
    base64: dataUrl.split(",")[1],
    centroidXNorm: sumX / maskCount / width,
    centroidYNorm: sumY / maskCount / height
  };
}
