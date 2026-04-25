"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coverageConfidence, emptyCoverage, type CoverageCell } from "@/lib/scan-coverage";

function coverageFromAngle(angle: number, confidence: number): CoverageCell[] {
  const cells = emptyCoverage();
  const normalized = ((angle + Math.PI) / (Math.PI * 2)) * cells.length;
  const index = Math.max(0, Math.min(cells.length - 1, Math.floor(normalized)));

  return cells.map((cell, cellIndex) =>
    cellIndex === index
      ? {
          ...cell,
          covered: true,
          confidence
        }
      : cell
  );
}

function analyzeVideoFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 120;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  let totalBrightness = 0;
  for (let index = 0; index < data.length; index += 4) {
    totalBrightness += (data[index] ?? 0) * 0.299 + (data[index + 1] ?? 0) * 0.587 + (data[index + 2] ?? 0) * 0.114;
  }

  const averageBrightness = totalBrightness / (data.length / 4);
  const threshold = averageBrightness < 128 ? averageBrightness + 24 : averageBrightness - 24;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const index = (y * canvas.width + x) * 4;
      const brightness =
        (data[index] ?? 0) * 0.299 +
        (data[index + 1] ?? 0) * 0.587 +
        (data[index + 2] ?? 0) * 0.114;
      const differs =
        averageBrightness < 128 ? brightness > threshold : brightness < threshold;

      if (differs) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return null;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const dx = centerX - canvas.width / 2;
  const dy = centerY - canvas.height / 2;
  const objectArea = ((maxX - minX) * (maxY - minY)) / (canvas.width * canvas.height);
  const confidence = Math.max(0.12, Math.min(0.98, objectArea * 3.4));
  const angle = Math.atan2(dy, dx);
  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.72);

  return {
    coverage: coverageFromAngle(angle, confidence),
    confidence,
    previewDataUrl
  };
}

export default function ScanPage({
  params
}: {
  params: { sessionId: string };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("waiting for camera");
  const [coverage, setCoverage] = useState<CoverageCell[]>(() => emptyCoverage());
  const [confidence, setConfidence] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId = 0;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (!videoRef.current) {
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setConnected(true);
        setStatus("move around the object to fill the ring");

        intervalId = window.setInterval(async () => {
          if (!videoRef.current || cancelled) {
            return;
          }

          const frame = analyzeVideoFrame(videoRef.current);

          if (!frame) {
            return;
          }

          setCoverage((current) =>
            current.map((cell) => {
              const next = frame.coverage.find((item) => item.id === cell.id);
              return next
                ? {
                    ...cell,
                    covered: cell.covered || next.covered,
                    confidence: Math.max(cell.confidence, next.confidence)
                  }
                : cell;
            })
          );

          setConfidence((current) => Math.max(current, frame.confidence));

          await fetch(`/api/scan/session/${params.sessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "capturing",
              frame: {
                ...frame,
                updatedAt: new Date().toISOString(),
                objectHint: frame.confidence > 0.55 ? "captured-object" : undefined
              }
            })
          }).catch(() => null);
        }, 900);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "camera unavailable");
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [params.sessionId]);

  const mergedCoverage = useMemo(
    () => ({
      cells: coverage,
      overall: coverageConfidence(coverage)
    }),
    [coverage]
  );

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-6 font-mono text-[#EDEDED]">
      <div className="mx-auto grid w-full max-w-md gap-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#EF9F27]">
            Remote Lens
          </p>
          <h1 className="mt-2 text-xl font-semibold">Scan from your phone</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/58">
            Move around the object until the ring turns green. Yiiya uses this as a fast coverage heuristic, then polishes the result back on desktop.
          </p>
        </div>

        <div className="overflow-hidden border border-[#1A1A1A] bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
        </div>

        <div className="grid gap-3 border border-[#1A1A1A] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em]">
            <span className="text-white/46">{status}</span>
            <span className={connected ? "text-[#39FF14]" : "text-white/35"}>
              {Math.round(Math.max(mergedCoverage.overall, confidence) * 100)}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {mergedCoverage.cells.map((cell) => (
              <div
                key={cell.id}
                className="h-10 border"
                style={{
                  borderColor: cell.covered ? "rgba(57,255,20,0.45)" : "#1A1A1A",
                  background: cell.covered
                    ? "rgba(57,255,20,0.14)"
                    : "rgba(255,255,255,0.02)"
                }}
                title={cell.label}
              />
            ))}
          </div>
          <p className="text-xs leading-relaxed text-white/48">
            Tip: keep the object centered, then circle slowly so different sides enter the frame.
          </p>
        </div>
      </div>
    </main>
  );
}
