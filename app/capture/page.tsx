"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useYiiyaStore } from "@/lib/store";
import { segmentAtPoint, type SegmentResult } from "@/lib/vision/segment";
import { recordClip, clipToMultiViewFrames } from "@/lib/vision/video-frames";

type Status = "starting" | "ready" | "segmenting" | "recording" | "extracting" | "error";

const ORBIT_MS = 6000;

/**
 * Mobile-first capture: point the camera at an object, tap it, and the
 * on-device segmenter (MediaPipe InteractiveSegmenter, runs entirely in the
 * browser — no server round-trip) isolates it onto a white background ready
 * for the same image-to-3D cascade the desktop reference-image drop uses.
 *
 * Video mode: after tapping, "Orbit" records a short walk-around clip and
 * extracts front/left/back views on-device (lib/vision/video-frames.ts),
 * unlocking the multi-view provider for real geometry instead of a
 * hallucinated backside. Falls back to the single tapped photo when the
 * object can't be tracked through the whole clip.
 */
export default function CapturePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tapRef = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<SegmentResult | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera access and reload."
            : "Couldn't access the camera on this device."
        );
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const handleTap = useCallback(
    async (e: React.MouseEvent<HTMLVideoElement>) => {
      const video = videoRef.current;
      if (!video || status !== "ready") return;
      const rect = video.getBoundingClientRect();
      const xNorm = (e.clientX - rect.left) / rect.width;
      const yNorm = (e.clientY - rect.top) / rect.height;

      setStatus("segmenting");
      setError(null);
      setNotice(null);
      try {
        const result = await segmentAtPoint(video, xNorm, yNorm);
        tapRef.current = { x: xNorm, y: yNorm };
        setPreview(result);
        setStatus("ready");
      } catch (err) {
        setStatus("ready");
        setError(err instanceof Error ? err.message : "Couldn't isolate an object there.");
      }
    },
    [status]
  );

  const handleUse = useCallback(() => {
    if (!preview) return;
    useYiiyaStore.getState().setReferenceImage({
      base64: preview.base64,
      mediaType: "image/png",
      name: "capture.png",
      previewUrl: preview.dataUrl
    });
    router.push("/app?autoGenerate=1");
  }, [preview, router]);

  // Orbit capture: record a walk-around clip, extract 3 tracked views, and
  // hand front + [left, back] to the pipeline. Every failure path degrades to
  // the already-proven single-photo flow — orbit can only add signal.
  const handleOrbit = useCallback(async () => {
    const stream = streamRef.current;
    const tap = tapRef.current;
    if (!stream || !tap || !preview) return;

    setError(null);
    setNotice(null);
    setStatus("recording");
    try {
      const clip = await recordClip(stream, ORBIT_MS);
      setStatus("extracting");
      const { views, usable } = await clipToMultiViewFrames(clip, tap.x, tap.y);

      if (usable >= 3) {
        useYiiyaStore.getState().setReferenceImage({
          base64: views[0].base64,
          mediaType: "image/png",
          name: "orbit-front.png",
          previewUrl: views[0].dataUrl,
          additionalViews: [
            { base64: views[1].base64, mediaType: "image/png" },
            { base64: views[2].base64, mediaType: "image/png" }
          ]
        });
        router.push("/app?autoGenerate=1");
        return;
      }

      // Tracking lost the object partway — keep the tapped photo instead.
      setStatus("ready");
      setNotice(
        `Only ${usable}/3 views tracked cleanly — walk slower and keep the object centered, or use the photo.`
      );
    } catch (err) {
      setStatus("ready");
      setError(err instanceof Error ? err.message : "Orbit capture failed — the photo still works.");
    }
  }, [preview, router]);

  const busy = status === "recording" || status === "extracting";

  return (
    <div className="min-h-screen bg-black text-zinc-300 flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-mono text-zinc-500 tracking-widest">YIIYA · CAPTURE</span>
        <button
          onClick={() => router.push("/app")}
          className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-zinc-950">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          onClick={handleTap}
          playsInline
          muted
          className="max-h-full max-w-full cursor-crosshair"
        />

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-zinc-600">
            Requesting camera…
          </div>
        )}
        {status === "segmenting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-mono text-amber-400">
            Isolating object…
          </div>
        )}
        {status === "recording" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-[11px] font-mono">
            <span className="text-red-400 animate-pulse">● Recording — walk slowly around the object</span>
            <span className="text-zinc-500">{Math.round(ORBIT_MS / 1000)}s, keep it centered</span>
          </div>
        )}
        {status === "extracting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-mono text-amber-400">
            Extracting views from your orbit…
          </div>
        )}
        {status === "error" && error && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-[11px] font-mono text-red-500">
            {error}
          </div>
        )}
        {status === "ready" && !preview && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-zinc-500 bg-black/60 px-3 py-1.5 rounded-sm text-center max-w-[85%]">
            Tap the object you want in 3D
            <span className="block text-[8px] text-zinc-600 mt-0.5">
              matte, opaque objects work best · then Orbit (walk around it) for real
              geometry — a single photo guesses the unseen sides
            </span>
            <span className="block text-[8px] text-zinc-700 mt-0.5">
              people &amp; faces are the hardest case — expect a rough result
            </span>
          </div>
        )}
        {status === "ready" && (error || notice) && (
          <div
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-black/60 px-3 py-1.5 rounded-sm max-w-[80%] text-center ${
              error ? "text-red-500" : "text-amber-400"
            }`}
          >
            {error ?? notice}
          </div>
        )}
      </div>

      {preview && (
        <div className="border-t border-zinc-900 p-4 flex items-center gap-4 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.dataUrl}
            alt="isolated object"
            className="h-20 w-20 object-contain bg-zinc-950 rounded-sm border border-zinc-800"
          />
          <div className="flex-1 flex flex-col gap-2">
            <button
              onClick={handleOrbit}
              disabled={busy}
              className="w-full py-2.5 bg-amber-400 text-black rounded-sm text-[10px] font-mono hover:bg-amber-300 transition-colors disabled:opacity-50"
            >
              {busy ? "Capturing orbit…" : "Orbit for real 3D (walk around it)"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setPreview(null)}
                disabled={busy}
                className="flex-1 py-2.5 border border-zinc-800 rounded-sm text-[10px] font-mono text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              >
                Retry
              </button>
              <button
                onClick={handleUse}
                disabled={busy}
                className="flex-1 py-2.5 bg-zinc-100 text-black rounded-sm text-[10px] font-mono hover:bg-white transition-colors disabled:opacity-50"
              >
                Photo → 3D
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
