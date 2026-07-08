"use client";

/**
 * Records a seamless 360° turntable clip of the active asset as a short webm
 * video, entirely client-side (`HTMLCanvasElement.captureStream` +
 * `MediaRecorder` — both standard browser APIs, no server round-trip, no
 * cost). Drives rotation directly through a registered spin control rather
 * than the general animation-preset system, so the loop is always exactly
 * one clean revolution regardless of whatever preset the user had selected.
 */

let rendererDom: HTMLCanvasElement | null = null;
let spinControl: SpinControl | null = null;

export type SpinControl = {
  /** Rotates the active object through exactly one full revolution over `durationMs`, then stops. */
  start: (durationMs: number) => void;
};

export function registerCanvasForRecording(dom: HTMLCanvasElement | null) {
  rendererDom = dom;
}

export function registerSpinControl(control: SpinControl | null) {
  spinControl = control;
}

export type TurntableResult = { blobUrl: string; mimeType: string };

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function canRecordTurntable(): boolean {
  return Boolean(rendererDom) && Boolean(spinControl) && pickSupportedMimeType() !== null;
}

export function recordTurntable(durationMs = 4000): Promise<TurntableResult> {
  return new Promise((resolve, reject) => {
    if (!rendererDom) {
      reject(new Error("Nothing to record yet — generate an asset first."));
      return;
    }
    if (!spinControl) {
      reject(new Error("Viewer isn't ready to record."));
      return;
    }
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      reject(new Error("This browser can't record video."));
      return;
    }

    const canvasWithCapture = rendererDom as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream;
    };
    if (!canvasWithCapture.captureStream) {
      reject(new Error("This browser doesn't support canvas recording."));
      return;
    }

    const stream = canvasWithCapture.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("Recording failed"));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve({ blobUrl: URL.createObjectURL(blob), mimeType });
    };

    recorder.start();
    spinControl.start(durationMs);
    // Small trailing buffer so the recording doesn't cut off the exact last frame.
    setTimeout(() => recorder.stop(), durationMs + 150);
  });
}
