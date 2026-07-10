"use client";

/**
 * Video → multi-view frames, entirely on-device.
 *
 * The user records a short clip while walking around an object. We extract
 * evenly-spaced frames, segment the tapped object in each one (reusing the
 * MediaPipe InteractiveSegmenter from lib/vision/segment.ts), and track the
 * object across frames by seeding each frame's tap point with the previous
 * frame's mask centroid. No server round-trip, no cost — the same zero-margin
 * posture as the photo capture path.
 *
 * Output maps onto fal's Hunyuan3D multi-view contract (front/back/left):
 * first usable frame → front, middle → left, last → back. Approximate view
 * labels are acceptable to the model; when fewer than 3 frames segment
 * cleanly we return what we have and the caller falls back to the proven
 * single-image cascade.
 */

import { segmentAtPointWithCentroid, type SegmentResultWithCentroid } from "@/lib/vision/segment";

export type MultiViewFrames = {
  /** Isolated-on-white PNGs, ordered [front, left, back]. 1–3 entries. */
  views: Array<{ base64: string; dataUrl: string }>;
  /** How many raw frames were sampled vs. how many segmented cleanly. */
  sampled: number;
  usable: number;
};

/** Records `durationMs` of the given video element's stream. Returns a Blob. */
export function recordClip(stream: MediaStream, durationMs: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
    );
    if (!mime) {
      reject(new Error("Video recording isn't supported in this browser."));
      return;
    }
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("Recording failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.start();
    window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
  });
}

/**
 * Extracts up to `count` evenly-spaced frames from a recorded clip by seeking
 * a detached <video> element. Frames come back as canvases ready to segment.
 */
async function extractFrames(clip: Blob, count: number): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(clip);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Couldn't decode the recorded clip."));
    });

    // Some browsers report Infinity for MediaRecorder blobs until a large
    // seek forces duration resolution (a long-standing Chromium quirk).
    if (!Number.isFinite(video.duration)) {
      video.currentTime = 1e10;
      await new Promise<void>((resolve) => {
        video.ontimeupdate = () => {
          video.ontimeupdate = null;
          resolve();
        };
      });
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) throw new Error("Recorded clip is empty.");

    const frames: HTMLCanvasElement[] = [];
    for (let i = 0; i < count; i++) {
      // Sample inside [5%, 95%] — the very first/last frames are usually
      // motion-blurred by the press/release of the record button.
      const t = duration * (0.05 + (0.9 * i) / Math.max(1, count - 1));
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("Seek failed while extracting frames."));
        video.currentTime = t;
      });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.drawImage(video, 0, 0);
      frames.push(canvas);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Full pipeline: clip + the user's initial tap point → up to 3 segmented
 * views. The tap point seeds frame 0; each subsequent frame is seeded with
 * the previous frame's mask centroid (cheap single-object tracking that holds
 * up for a slow walk-around).
 */
export async function clipToMultiViewFrames(
  clip: Blob,
  tapXNorm: number,
  tapYNorm: number
): Promise<MultiViewFrames> {
  const frames = await extractFrames(clip, 3);
  const views: MultiViewFrames["views"] = [];
  let seedX = tapXNorm;
  let seedY = tapYNorm;
  let usable = 0;

  for (const frame of frames) {
    try {
      const result: SegmentResultWithCentroid = await segmentAtPointWithCentroid(frame, seedX, seedY);
      views.push({ base64: result.base64, dataUrl: result.dataUrl });
      seedX = result.centroidXNorm;
      seedY = result.centroidYNorm;
      usable++;
    } catch {
      // Object lost in this frame (blur, out of view) — skip it. The caller
      // decides whether the remaining views justify the multi-view provider.
    }
  }

  return { views, sampled: frames.length, usable };
}
