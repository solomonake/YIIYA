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
 * Directional coaching for a guided orbit. Driven by elapsed fraction so the
 * user is told exactly where to move instead of a single static "walk around"
 * hint — the difference between a clean front/left/back set and a blur.
 */
function orbitCoach(pct: number): string {
  if (pct < 0.28) return "Step slowly to the LEFT — keep the object centered";
  if (pct < 0.55) return "Keep going — bring the BACK into view";
  if (pct < 0.8) return "Now round to the RIGHT side";
  return "Almost there — return to the FRONT";
}

/**
 * Device-aware, guided capture.
 *
 * Mobile: point the rear camera at an object, tap it (on-device MediaPipe
 * InteractiveSegmenter isolates it onto white, no server round-trip), then
 * either take the photo or run a GUIDED Orbit — a coached walk-around that
 * extracts front/left/back views for the multi-view provider (real geometry
 * instead of a hallucinated backside).
 *
 * Laptop/desktop: the webcam is fixed, so "walk around it" is impossible — we
 * detect that and offer single-image capture only, and point the user to open
 * the same URL on their phone for orbit. Every orbit failure path degrades to
 * the proven single-photo flow, so orbit can only ever add signal.
 */
export default function CapturePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tapRef = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** True for touch phones/tablets — gates the orbit affordance. */
  const [isMobile, setIsMobile] = useState(false);
  /** 0→1 progress through the orbit recording, for the ring + coaching. */
  const [orbitPct, setOrbitPct] = useState(0);
  /** Set after a partial orbit so we can offer an explicit "record again". */
  const [orbitRetryable, setOrbitRetryable] = useState(false);
  /** Each tap isolates one object; up to MAX_OBJECTS accumulate as chips. */
  const [cutouts, setCutouts] = useState<SegmentResult[]>([]);
  const preview = cutouts.length > 0 ? cutouts[cutouts.length - 1] : null;

  // Detect device, THEN request the camera with the right facing mode. A laptop
  // has no "environment" camera, so asking for one there can fail or pick wrong.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const coarse =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    setIsMobile(Boolean(coarse));

    navigator.mediaDevices
      .getUserMedia({
        video: coarse ? { facingMode: { ideal: "environment" } } : true,
        audio: false
      })
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
      setOrbitRetryable(false);
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

  // Every selected object goes through the capture queue — one generation each,
  // consumed sequentially by the workspace. A single object is just a queue of
  // one, so both paths share the same wiring.
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

  // Guided orbit: record a coached walk-around clip, extract 3 tracked views,
  // and hand front + [left, back] to the pipeline. A progress interval drives
  // the on-screen ring + directional coaching so the user knows where to move.
  const handleOrbit = useCallback(async () => {
    const stream = streamRef.current;
    const tap = tapRef.current;
    // Orbit tracks ONE object through the clip; it only offers itself when a
    // single object is selected, so multi-select never promises geometry it
    // cannot track.
    if (!stream || !tap || !preview || cutouts.length !== 1) return;

    setError(null);
    setNotice(null);
    setOrbitRetryable(false);
    setOrbitPct(0);
    setStatus("recording");

    const started = performance.now();
    const timer = window.setInterval(() => {
      setOrbitPct(Math.min(1, (performance.now() - started) / ORBIT_MS));
    }, 100);

    try {
      const clip = await recordClip(stream, ORBIT_MS);
      window.clearInterval(timer);
      setOrbitPct(1);
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

      // Tracking lost the object partway — offer an explicit retry with sharper
      // coaching, and keep the tapped photo as the safe fallback.
      setStatus("ready");
      setOrbitRetryable(true);
      setNotice(
        `Only ${usable}/3 angles were sharp. Move slower, keep the object centered and filling the frame, then record again — or just use the photo.`
      );
    } catch (err) {
      window.clearInterval(timer);
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 font-mono">
            <OrbitRing pct={orbitPct} />
            <span className="text-amber-300 text-[12px] text-center px-8">{orbitCoach(orbitPct)}</span>
            <span className="text-zinc-500 text-[10px]">
              {Math.ceil(ORBIT_MS / 1000 - (orbitPct * ORBIT_MS) / 1000)}s left · move steadily
            </span>
          </div>
        )}
        {status === "extracting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-mono text-amber-400">
            Extracting front, side &amp; back from your orbit…
          </div>
        )}
        {status === "error" && error && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-[11px] font-mono text-red-500">
            {error}
          </div>
        )}
        {status === "ready" && !preview && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-zinc-500 bg-black/60 px-3 py-1.5 rounded-sm text-center max-w-[88%]">
            Tap the objects you want in 3D — up to {MAX_OBJECTS}
            <span className="block text-[8px] text-zinc-600 mt-0.5">
              {isMobile
                ? "matte, opaque objects work best · with one object, Orbit (walk around it) captures real geometry — a single photo guesses the unseen sides"
                : "matte, opaque objects work best · a single webcam photo guesses the unseen sides — open this page on your phone to Orbit and walk around the object"}
            </span>
            <span className="block text-[8px] text-zinc-700 mt-0.5">
              people &amp; faces are the hardest case — expect a rough result
            </span>
          </div>
        )}
        {status === "ready" && (error || notice) && (
          <div
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-black/70 px-3 py-2 rounded-sm max-w-[85%] text-center ${
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
            {cutouts.length === 1 && isMobile && (
              <button
                onClick={handleOrbit}
                disabled={busy}
                className="w-full py-2.5 bg-amber-400 text-black rounded-sm text-[10px] font-mono hover:bg-amber-300 transition-colors disabled:opacity-50"
              >
                {busy
                  ? "Capturing orbit…"
                  : orbitRetryable
                    ? "Record orbit again — slower this time"
                    : "Orbit for real 3D (walk around it)"}
              </button>
            )}
            {cutouts.length === 1 && !isMobile && (
              <div className="text-[9px] font-mono text-zinc-600 text-center px-2 py-1.5 border border-zinc-900 rounded-sm">
                Want real geometry (not a guessed backside)? Open{" "}
                <span className="text-zinc-400">yiiya.app/capture</span> on your phone and Orbit.
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCutouts([]);
                  setNotice(null);
                  setOrbitRetryable(false);
                }}
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

/** Circular progress ring for the guided orbit recording. */
function OrbitRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#27272a" strokeWidth="4" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke="#fbbf24"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
      />
    </svg>
  );
}
