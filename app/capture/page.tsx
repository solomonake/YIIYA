"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useYiiyaStore } from "@/lib/store";
import { segmentAtPoint, type SegmentResult } from "@/lib/vision/segment";
import { recordClip, clipToMultiViewFrames } from "@/lib/vision/video-frames";

type Status = "starting" | "ready" | "segmenting" | "recording" | "extracting" | "error";

const ORBIT_MS = 6000;

/** Cap on objects per frame — each one costs a full paid generation. */
const MAX_OBJECTS = 4;

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
  /** Each tap isolates one object; up to MAX_OBJECTS accumulate as chips. */
  const [cutouts, setCutouts] = useState<SegmentResult[]>([]);
  const preview = cutouts.length > 0 ? cutouts[cutouts.length - 1] : null;

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

      if (cutouts.length >= MAX_OBJECTS) {
        setNotice(`Up to ${MAX_OBJECTS} objects per frame — remove one to add another.`);
        return;
      }

      setStatus("segmenting");
      setError(null);
      setNotice(null);
      try {
        const result = await segmentAtPoint(video, xNorm, yNorm);
        tapRef.current = { x: xNorm, y: yNorm };
        setCutouts((prev) => [...prev, result]);
        setStatus("ready");
      } catch (err) {
        setStatus("ready");
        setError(err instanceof Error ? err.message : "Couldn't isolate an object there.");
      }
    },
    [status, cutouts.length]
  );

  const removeCutout = useCallback((index: number) => {
    setCutouts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Every selected object goes through the capture queue — one generation
  // each, consumed sequentially by the workspace. A single object is just a
  // queue of one, so both paths share the same wiring.
  const handleUse = useCallback(() => {
    if (cutouts.length === 0) return;
    useYiiyaStore.getState().setCaptureQueue(
      cutouts.map((cutout, i) => ({
        base64: cutout.base64,
        mediaType: "image/png",
        name: cutouts.length === 1 ? "capture.png" : `capture-${i + 1}.png`,
        previewUrl: cutout.dataUrl
      }))
    );
    router.push("/app");
  }, [cutouts, router]);

  // Orbit capture: record a walk-around clip, extract 3 tracked views, and
  // hand front + [left, back] to the pipeline. Every failure path degrades to
  // the already-proven single-photo flow — orbit can only add signal.
  const handleOrbit = useCallback(async () => {
    const stream = streamRef.current;
    const tap = tapRef.current;
    // Orbit tracks ONE object through the clip; it only offers itself when a
    // single object is selected, so multi-select never promises geometry it
    // cannot track.
    if (!stream || !tap || !preview || cutouts.length !== 1) return;

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
  }, [preview, cutouts.length, router]);

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
            Tap the objects you want in 3D — up to {MAX_OBJECTS}
            <span className="block text-[8px] text-zinc-600 mt-0.5">
              matte, opaque objects work best · with one object, Orbit (walk around
              it) captures real geometry — a single photo guesses the unseen sides
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

      {cutouts.length > 0 && (
        <div className="border-t border-zinc-900 p-4 flex flex-col gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {cutouts.map((cutout, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cutout.dataUrl}
                  alt={`object ${i + 1}`}
                  className="h-16 w-16 object-contain bg-zinc-950 rounded-sm border border-zinc-800"
                />
                <button
                  onClick={() => removeCutout(i)}
                  disabled={busy}
                  aria-label={`Remove object ${i + 1}`}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-mono leading-none hover:bg-zinc-700 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            ))}
            {cutouts.length < MAX_OBJECTS && (
              <span className="text-[9px] font-mono text-zinc-600 ml-1">
                tap another object
                <span className="block">to add it ({cutouts.length}/{MAX_OBJECTS})</span>
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {cutouts.length === 1 && (
              <button
                onClick={handleOrbit}
                disabled={busy}
                className="w-full py-2.5 bg-amber-400 text-black rounded-sm text-[10px] font-mono hover:bg-amber-300 transition-colors disabled:opacity-50"
              >
                {busy ? "Capturing orbit…" : "Orbit for real 3D (walk around it)"}
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setCutouts([])}
                disabled={busy}
                className="flex-1 py-2.5 border border-zinc-800 rounded-sm text-[10px] font-mono text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                onClick={handleUse}
                disabled={busy}
                className="flex-1 py-2.5 bg-zinc-100 text-black rounded-sm text-[10px] font-mono hover:bg-white transition-colors disabled:opacity-50"
              >
                {cutouts.length === 1
                  ? "Photo → 3D (1 generation)"
                  : `${cutouts.length} objects → 3D (${cutouts.length} generations)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
