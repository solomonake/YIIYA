"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clippedEdges,
  emptyCoverage,
  surfaceCoverageConfidence,
  type CoverageCell,
  type CoverageSilhouette
} from "@/lib/scan-coverage";

function overlapArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) {
    return 0;
  }

  return (x2 - x1) * (y2 - y1);
}

function coverageFromSilhouette(
  silhouette: CoverageSilhouette,
  confidence: number,
  depthScore: number
): CoverageCell[] {
  const gridCells = emptyCoverage();
  const occupancyZones = [
    { x: 0, y: 0, width: 1 / 3, height: 1 / 3 },
    { x: 1 / 3, y: 0, width: 1 / 3, height: 1 / 3 },
    { x: 2 / 3, y: 0, width: 1 / 3, height: 1 / 3 },
    { x: 0, y: 1 / 3, width: 1 / 3, height: 1 / 3 },
    { x: 1 / 3, y: 1 / 3, width: 1 / 3, height: 1 / 3 },
    { x: 2 / 3, y: 1 / 3, width: 1 / 3, height: 1 / 3 },
    { x: 0, y: 2 / 3, width: 1 / 3, height: 1 / 3 },
    { x: 1 / 3, y: 2 / 3, width: 1 / 3, height: 1 / 3 },
    { x: 2 / 3, y: 2 / 3, width: 1 / 3, height: 1 / 3 }
  ];

  return gridCells.map((cell, index) => {
    if (index < 9) {
      const zone = occupancyZones[index];
      const overlap = overlapArea(zone, silhouette);
      const covered = overlap > zone.width * zone.height * 0.18;

      return {
        ...cell,
        covered,
        confidence: covered ? confidence : cell.confidence
      };
    }

    const depthThreshold =
      index === 9 ? depthScore >= 0.33 : index === 10 ? depthScore >= 0.58 : depthScore >= 0.82;

    return {
      ...cell,
      covered: depthThreshold,
      confidence: depthThreshold ? depthScore : cell.confidence
    };
  });
}

function analyzeVideoFrame(
  video: HTMLVideoElement,
  lastSilhouette?: CoverageSilhouette | null
) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 144;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  let totalBrightness = 0;
  for (let index = 0; index < data.length; index += 4) {
    totalBrightness +=
      (data[index] ?? 0) * 0.299 +
      (data[index + 1] ?? 0) * 0.587 +
      (data[index + 2] ?? 0) * 0.114;
  }

  const averageBrightness = totalBrightness / (data.length / 4);
  const threshold = averageBrightness < 128 ? averageBrightness + 20 : averageBrightness - 20;
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

  const silhouette = {
    x: minX / canvas.width,
    y: minY / canvas.height,
    width: (maxX - minX) / canvas.width,
    height: (maxY - minY) / canvas.height
  };
  const area = silhouette.width * silhouette.height;
  const clipped = clippedEdges(silhouette);
  const centeredX = Math.abs(silhouette.x + silhouette.width / 2 - 0.5);
  const centeredY = Math.abs(silhouette.y + silhouette.height / 2 - 0.5);
  const motionDelta = lastSilhouette
    ? Math.abs(silhouette.x - lastSilhouette.x) +
      Math.abs(silhouette.y - lastSilhouette.y) +
      Math.abs(area - lastSilhouette.width * lastSilhouette.height)
    : 0.12;
  const depthScore = Math.max(
    0.08,
    Math.min(
      0.99,
      area * 2.4 +
        (1 - Math.min(1, centeredX * 2.1 + centeredY * 2.1)) * 0.24 +
        Math.min(0.22, motionDelta * 1.4)
    )
  );
  const confidence = Math.max(0.12, Math.min(0.98, area * 3.2));

  let guidance = "circle slowly to reveal more surface";
  if (clipped.left || clipped.right || clipped.top || clipped.bottom) {
    guidance = "pull back slightly until the full object fits inside the frame";
  } else if (area < 0.12) {
    guidance = "move closer until the object fills more of the frame";
  } else if (centeredX > 0.16 || centeredY > 0.16) {
    guidance = "keep the object centered while you move around it";
  } else if (motionDelta < 0.03) {
    guidance = "change angle to capture a new face of the object";
  }

  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.72);

  return {
    silhouette,
    confidence,
    depthScore,
    guidance,
    previewDataUrl,
    coverage: coverageFromSilhouette(silhouette, confidence, depthScore)
  };
}

export default function ScanPage({
  params
}: {
  params: { sessionId: string };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSilhouetteRef = useRef<CoverageSilhouette | null>(null);
  const [status, setStatus] = useState("waiting for camera");
  const [coverage, setCoverage] = useState<CoverageCell[]>(() => emptyCoverage());
  const [confidence, setConfidence] = useState(0);
  const [depthScore, setDepthScore] = useState(0);
  const [connected, setConnected] = useState(false);
  const [guidance, setGuidance] = useState("hold the object in the center to start");
  const [silhouette, setSilhouette] = useState<CoverageSilhouette | null>(null);

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
        setStatus("depth guide active");

        intervalId = window.setInterval(async () => {
          if (!videoRef.current || cancelled) {
            return;
          }

          const frame = analyzeVideoFrame(videoRef.current, lastSilhouetteRef.current);

          if (!frame) {
            setGuidance("find clean contrast between the object and the background");
            return;
          }

          lastSilhouetteRef.current = frame.silhouette;
          setSilhouette(frame.silhouette);
          setGuidance(frame.guidance);
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
          setDepthScore((current) => Math.max(current, frame.depthScore));

          await fetch(`/api/scan/session/${params.sessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "capturing",
              frame: {
                coverage: frame.coverage,
                confidence: frame.confidence,
                depthScore: frame.depthScore,
                guidance: frame.guidance,
                silhouette: frame.silhouette,
                previewDataUrl: frame.previewDataUrl,
                updatedAt: new Date().toISOString(),
                objectHint: frame.depthScore > 0.62 ? "captured-object" : undefined
              }
            })
          }).catch(() => null);
        }, 650);
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
      overall: surfaceCoverageConfidence(coverage)
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
          <h1 className="mt-2 text-xl font-semibold">3D scan from your phone</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/58">
            Yiiya is using a LiDAR-style surface guide here: keep the object boxed, reveal new faces, and fill the coverage map before polishing on desktop.
          </p>
        </div>

        <div className="relative overflow-hidden border border-[#1A1A1A] bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-[14%] bottom-[12%] top-[12%] border border-white/18" />
            {silhouette ? (
              <div
                className="absolute border border-[#39FF14]/80 bg-[#39FF14]/[0.06] shadow-[0_0_0_1px_rgba(57,255,20,0.12)]"
                style={{
                  left: `${silhouette.x * 100}%`,
                  top: `${silhouette.y * 100}%`,
                  width: `${silhouette.width * 100}%`,
                  height: `${silhouette.height * 100}%`
                }}
              >
                <div className="grid h-full grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div key={index} className="border border-[#39FF14]/20" />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="absolute left-3 top-3 border border-[#1A1A1A] bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/68">
              {status}
            </div>
            <div className="absolute bottom-3 left-3 right-3 border border-[#1A1A1A] bg-black/60 px-3 py-2 text-[11px] leading-relaxed text-white/76">
              {guidance}
            </div>
          </div>
        </div>

        <div className="grid gap-3 border border-[#1A1A1A] bg-white/[0.02] p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="border border-[#1A1A1A] py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Surface</p>
              <p className={`mt-1 text-sm font-semibold ${connected ? "text-[#39FF14]" : "text-white/35"}`}>
                {Math.round(mergedCoverage.overall * 100)}%
              </p>
            </div>
            <div className="border border-[#1A1A1A] py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Depth</p>
              <p className="mt-1 text-sm font-semibold text-[#EF9F27]">
                {Math.round(depthScore * 100)}%
              </p>
            </div>
            <div className="border border-[#1A1A1A] py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Signal</p>
              <p className="mt-1 text-sm font-semibold text-white/82">
                {Math.round(confidence * 100)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {mergedCoverage.cells.slice(0, 9).map((cell) => (
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

          <div className="grid grid-cols-3 gap-2">
            {mergedCoverage.cells.slice(9).map((cell) => (
              <div
                key={cell.id}
                className="border px-2 py-2 text-center text-[10px] uppercase tracking-[0.14em]"
                style={{
                  borderColor: cell.covered ? "rgba(239,159,39,0.4)" : "#1A1A1A",
                  color: cell.covered ? "#EF9F27" : "rgba(255,255,255,0.34)"
                }}
              >
                {cell.label.replace("-depth", "")}
              </div>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-white/48">
            Best capture loop: center object, step closer, rotate around it, then tilt up or down so the top and bottom surfaces also register.
          </p>
        </div>
      </div>
    </main>
  );
}
