"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useYiiyaStore } from "@/lib/store";
import { segmentAtPoint, type SegmentResult } from "@/lib/vision/segment";

type Status = "starting" | "ready" | "segmenting" | "error";

/**
 * Mobile-first capture: point the camera at an object, tap it, and the
 * on-device segmenter (MediaPipe InteractiveSegmenter, runs entirely in the
 * browser — no server round-trip) isolates it onto a white background ready
 * for the same image-to-3D cascade the desktop reference-image drop uses.
 */
export default function CapturePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
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
      try {
        const result = await segmentAtPoint(video, xNorm, yNorm);
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
        {status === "error" && error && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-[11px] font-mono text-red-500">
            {error}
          </div>
        )}
        {status === "ready" && !preview && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-zinc-500 bg-black/60 px-3 py-1.5 rounded-sm">
            Tap the object you want in 3D
          </div>
        )}
        {status === "ready" && error && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-red-500 bg-black/60 px-3 py-1.5 rounded-sm max-w-[80%] text-center">
            {error}
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
          <div className="flex-1 flex gap-2">
            <button
              onClick={() => setPreview(null)}
              className="flex-1 py-2.5 border border-zinc-800 rounded-sm text-[10px] font-mono text-zinc-400 hover:text-zinc-100"
            >
              Retry
            </button>
            <button
              onClick={handleUse}
              className="flex-1 py-2.5 bg-zinc-100 text-black rounded-sm text-[10px] font-mono hover:bg-white transition-colors"
            >
              Generate 3D
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
