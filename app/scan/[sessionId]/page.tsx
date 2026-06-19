// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clippedEdges,
  emptyCoverage,
  mergeCoverage,
  surfaceCoverageConfidence,
  type CoverageCell,
  type CoverageSilhouette
} from "@/lib/scan-coverage";
import type { ScanJobSummary } from "@/lib/scan-types";

type CapturedKeyframe = {
  id: string;
  file: File;
  previewDataUrl: string;
  sharpness: number;
  capturedAt: string;
};

type CaptureFrame = {
  silhouette: CoverageSilhouette;
  confidence: number;
  depthScore: number;
  guidance: string;
  previewDataUrl: string;
  coverage: CoverageCell[];
  motionDelta: number;
  sharpness: number;
  glareScore: number;
};

const finalStates = new Set<ScanJobSummary["state"]>([
  "complete",
  "failed",
  "cancelled"
]);

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

function chooseRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const candidates = [
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!match) {
    throw new Error("Could not convert frame into an uploadable file.");
  }

  const mimeType = match[1] ?? "image/jpeg";
  const binary = atob(match[2] ?? "");
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mimeType });
}

function analyzeVideoFrame(
  video: HTMLVideoElement,
  lastSilhouette?: CoverageSilhouette | null
): CaptureFrame | null {
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 168;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  let totalBrightness = 0;
  let highlightPixels = 0;
  let edgeEnergy = 0;
  let edgeSamples = 0;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const brightness =
        (data[index] ?? 0) * 0.299 +
        (data[index + 1] ?? 0) * 0.587 +
        (data[index + 2] ?? 0) * 0.114;

      totalBrightness += brightness;

      if (brightness > 235) {
        highlightPixels += 1;
      }

      if (x > 0) {
        const leftIndex = (y * canvas.width + (x - 1)) * 4;
        const leftBrightness =
          (data[leftIndex] ?? 0) * 0.299 +
          (data[leftIndex + 1] ?? 0) * 0.587 +
          (data[leftIndex + 2] ?? 0) * 0.114;

        edgeEnergy += Math.abs(brightness - leftBrightness);
        edgeSamples += 1;
      }
    }
  }

  const totalPixels = data.length / 4;
  const averageBrightness = totalBrightness / Math.max(1, totalPixels);
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
  const glareScore = highlightPixels / Math.max(1, totalPixels);
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
  const sharpness = Math.max(
    0.08,
    Math.min(0.99, edgeEnergy / Math.max(1, edgeSamples) / 46)
  );

  let guidance = "circle slowly to reveal more surface";
  if (glareScore > 0.18) {
    guidance = "reduce glare and rotate slower; reflective hotspots will break the solve";
  } else if (clipped.left || clipped.right || clipped.top || clipped.bottom) {
    guidance = "pull back slightly until the full object fits inside the frame";
  } else if (area < 0.12) {
    guidance = "move closer until the object fills more of the frame";
  } else if (centeredX > 0.16 || centeredY > 0.16) {
    guidance = "keep the object centered while you move around it";
  } else if (sharpness < 0.18) {
    guidance = "slow down and steady the phone to recover detail";
  } else if (motionDelta < 0.03) {
    guidance = "change angle to capture a new face of the object";
  }

  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.76);

  return {
    silhouette,
    confidence,
    depthScore,
    guidance,
    previewDataUrl,
    coverage: coverageFromSilhouette(silhouette, confidence, depthScore),
    motionDelta,
    sharpness,
    glareScore
  };
}

function stageLabel(stage: ScanJobSummary["stage"]) {
  return stage.replaceAll("_", " ");
}

export default function ScanPage({
  params
}: {
  params: { sessionId: string };
}) {
  const scanId = params.sessionId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const analysisIntervalRef = useRef<number | null>(null);
  const lastSilhouetteRef = useRef<CoverageSilhouette | null>(null);
  const lastKeyframeAtRef = useRef(0);
  const captureStartedAtRef = useRef<number | null>(null);
  const pendingStopResolveRef = useRef<((value: Blob | null) => void) | null>(null);
  const keyframesRef = useRef<CapturedKeyframe[]>([]);
  const sampleCounterRef = useRef(0);
  const lastPreviewDataUrlRef = useRef<string | null>(null);
  const coverageRef = useRef<CoverageCell[]>(emptyCoverage());

  const [job, setJob] = useState<ScanJobSummary | null>(null);
  const [status, setStatus] = useState("waiting to enable camera");
  const [coverage, setCoverage] = useState<CoverageCell[]>(() => emptyCoverage());
  const [confidence, setConfidence] = useState(0);
  const [depthScore, setDepthScore] = useState(0);
  const [guidance, setGuidance] = useState(
    "Enable the camera, keep the object centered, and capture three clean arcs."
  );
  const [silhouette, setSilhouette] = useState<CoverageSilhouette | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [isCapturing, setCapturing] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyframes, setKeyframes] = useState<CapturedKeyframe[]>([]);

  const loadJob = useCallback(async () => {
    const response = await fetch(`/api/scan/jobs/${scanId}`);
    const payload = (await response.json().catch(() => null)) as
      | ScanJobSummary
      | { error?: string }
      | null;

    if (!response.ok || !payload || !("id" in payload)) {
      throw new Error(
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Scan job lookup failed with ${response.status}`
      );
    }

    setJob(payload);
    setCoverage(payload.coverage);
    coverageRef.current = payload.coverage;
    setConfidence((current) => Math.max(payload.latestFrame?.confidence ?? 0, current));
    setDepthScore((current) => Math.max(payload.latestFrame?.depthScore ?? 0, current));
    setGuidance((current) => payload.latestFrame?.guidance ?? current);
    setSilhouette(payload.latestFrame?.silhouette ?? null);
    return payload;
  }, [scanId]);

  useEffect(() => {
    void loadJob().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load scan job.");
      setStatus("scan job unavailable");
    });
  }, [loadJob]);

  useEffect(() => {
    if (!job?.id || job.captureStatus !== "uploaded" || finalStates.has(job.state)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadJob().catch(() => null);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [job?.captureStatus, job?.id, job?.state, loadJob]);

  const stopAnalysis = useCallback(() => {
    if (analysisIntervalRef.current) {
      window.clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve<Blob | null>(null);
    }

    return new Promise<Blob | null>((resolve) => {
      pendingStopResolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const stopCamera = useCallback(() => {
    stopAnalysis();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    recorderChunksRef.current = [];
    setCameraReady(false);
  }, [stopAnalysis]);

  useEffect(
    () => () => {
      stopAnalysis();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopAnalysis]
  );

  const startCamera = async () => {
    if (cameraReady || cameraStarting) {
      return;
    }

    setCameraStarting(true);
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      if (!videoRef.current) {
        throw new Error("Video preview was not available.");
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraReady(true);
      setStatus("camera ready");
      setGuidance("Start capture, then orbit top-down, eye-level, and slightly underneath.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Camera access failed.";
      setErrorMessage(message);
      setStatus("camera unavailable");
    } finally {
      setCameraStarting(false);
    }
  };

  const postCaptureFrame = useCallback(
    async (
      frame: CaptureFrame,
      captureStatus: "capturing" | "uploading",
      includePreviewData: boolean
    ) => {
      const response = await fetch(`/api/scan/jobs/${scanId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectHint: "captured-object",
          captureStatus,
          frame: {
            coverage: frame.coverage,
            confidence: frame.confidence,
            depthScore: frame.depthScore,
            guidance: frame.guidance,
            silhouette: frame.silhouette,
            sharpness: frame.sharpness,
            previewDataUrl: includePreviewData ? frame.previewDataUrl : undefined,
            updatedAt: new Date().toISOString()
          }
        })
      }).catch(() => null);

      if (!response?.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | ScanJobSummary
        | null;

      if (payload?.id) {
        setJob(payload);
      }
    },
    [scanId]
  );

  const startCapture = async () => {
    if (!cameraReady || !videoRef.current || isCapturing || isUploading) {
      return;
    }

    keyframesRef.current = [];
    setKeyframes([]);
    lastSilhouetteRef.current = null;
    lastKeyframeAtRef.current = 0;
    sampleCounterRef.current = 0;
    captureStartedAtRef.current = Date.now();
    recorderChunksRef.current = [];
    setCapturing(true);
    setStatus("capturing");
    setGuidance("Orbit slowly. Build coverage from top, sides, then lower angles.");

    const recorderMimeType = chooseRecorderMimeType();
    if (streamRef.current && typeof MediaRecorder !== "undefined") {
      const recorder = new MediaRecorder(
        streamRef.current,
        recorderMimeType ? { mimeType: recorderMimeType } : undefined
      );

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recorderChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob =
          recorderChunksRef.current.length > 0
            ? new Blob(recorderChunksRef.current, {
                type: recorder.mimeType || recorderMimeType || "video/webm"
              })
            : null;

        pendingStopResolveRef.current?.(blob);
        pendingStopResolveRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start(1000);
    }

    analysisIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current) {
        return;
      }

      const frame = analyzeVideoFrame(videoRef.current, lastSilhouetteRef.current);

      if (!frame) {
        setGuidance("Find a cleaner background contrast to isolate the object.");
        return;
      }

      lastSilhouetteRef.current = frame.silhouette;
      sampleCounterRef.current += 1;
      lastPreviewDataUrlRef.current = frame.previewDataUrl;
      setSilhouette(frame.silhouette);
      setGuidance(frame.guidance);
      setConfidence((current) => Math.max(current, frame.confidence));
      setDepthScore((current) => Math.max(current, frame.depthScore));

      const merged = mergeCoverage(coverageRef.current, frame.coverage);
      const coverageGain = merged.some(
        (cell, index) => cell.covered && !coverageRef.current[index]?.covered
      );
      const enoughTimePassed = Date.now() - lastKeyframeAtRef.current > 1400;
      const shouldCaptureKeyframe =
        frame.sharpness >= 0.18 &&
        frame.glareScore < 0.18 &&
        enoughTimePassed &&
        (coverageGain || keyframesRef.current.length < 4 || frame.motionDelta > 0.05);

      if (shouldCaptureKeyframe && keyframesRef.current.length < 8) {
        const keyframe: CapturedKeyframe = {
          id: `keyframe-${Date.now()}`,
          file: dataUrlToFile(
            frame.previewDataUrl,
            `scan-${scanId}-${Date.now()}.jpg`
          ),
          previewDataUrl: frame.previewDataUrl,
          sharpness: frame.sharpness,
          capturedAt: new Date().toISOString()
        };
        keyframesRef.current = [...keyframesRef.current, keyframe];
        setKeyframes(keyframesRef.current);
        lastKeyframeAtRef.current = Date.now();
      }

      coverageRef.current = merged;
      setCoverage(merged);
      void postCaptureFrame(
        frame,
        "capturing",
        shouldCaptureKeyframe || sampleCounterRef.current % 4 === 0
      );
    }, 700);
  };

  const uploadFrame = useCallback(
    async (file: File, uploadKind: "preview" | "keyframe", metadata?: Record<string, unknown>) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("uploadKind", uploadKind);

      if (metadata) {
        formData.append("metadata", JSON.stringify(metadata));
      }

      const response = await fetch(`/api/scan/jobs/${scanId}/upload/frame`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Frame upload failed with ${response.status}`);
      }

      const payload = (await response.json().catch(() => null)) as
        | { upload?: unknown; url?: string }
        | null;

      return payload?.url ?? null;
    },
    [scanId]
  );

  const finishCapture = async () => {
    if (!isCapturing) {
      return;
    }

    setCapturing(false);
    setUploading(true);
    setStatus("uploading");
    setGuidance("Uploading video and curated keyframes. Keep this page open.");
    stopAnalysis();

    try {
      const previewDataUrl = lastPreviewDataUrlRef.current;
      const lastFrame =
        previewDataUrl && videoRef.current
          ? analyzeVideoFrame(videoRef.current, lastSilhouetteRef.current)
          : null;

      if (lastFrame) {
        await postCaptureFrame(lastFrame, "uploading", true);
      }

      const videoBlob = await stopRecorder();
      const durationMs = captureStartedAtRef.current
        ? Date.now() - captureStartedAtRef.current
        : undefined;
      const recorderMimeType = videoBlob?.type || chooseRecorderMimeType() || "video/webm";
      const videoExtension = recorderMimeType.includes("mp4") ? "mp4" : "webm";

      if (videoBlob && videoBlob.size > 0) {
        const formData = new FormData();
        formData.append(
          "file",
          new File([videoBlob], `scan-${scanId}.${videoExtension}`, {
            type: recorderMimeType
          })
        );

        const response = await fetch(`/api/scan/jobs/${scanId}/upload/video`, {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Video upload failed with ${response.status}`);
        }
      }

      const framesToUpload =
        keyframesRef.current.length > 0
          ? [...keyframesRef.current].sort((a, b) => b.sharpness - a.sharpness)
          : previewDataUrl
            ? [
                {
                  id: `fallback-frame-${Date.now()}`,
                  file: dataUrlToFile(previewDataUrl, `scan-${scanId}-preview.jpg`),
                  previewDataUrl,
                  sharpness: 0.2,
                  capturedAt: new Date().toISOString()
                }
              ]
            : [];

      if (framesToUpload.length > 0) {
        const [previewFrame, ...otherFrames] = framesToUpload;
        await uploadFrame(previewFrame.file, "preview", {
          capturedAt: previewFrame.capturedAt,
          sharpness: previewFrame.sharpness
        });

        for (const frame of otherFrames) {
          await uploadFrame(frame.file, "keyframe", {
            capturedAt: frame.capturedAt,
            sharpness: frame.sharpness
          });
        }
      }

      const response = await fetch(`/api/scan/jobs/${scanId}/complete-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectHint: "captured-object",
          durationMs,
          keyframeCount: framesToUpload.length
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | ScanJobSummary
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Upload completion failed with ${response.status}`
        );
      }

      setJob(payload);
      setStatus("uploaded");
      setGuidance("Capture uploaded. Return to the desktop tab for processing and export.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed.";
      setErrorMessage(message);
      setStatus("upload failed");
    } finally {
      setUploading(false);
    }
  };

  const mergedCoverage = useMemo(
    () => ({
      cells: coverage,
      overall: surfaceCoverageConfidence(coverage)
    }),
    [coverage]
  );
  const progressLabel = job
    ? `${stageLabel(job.stage)} · ${Math.round(job.progress * 100)}%`
    : "capture pending";

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-6 font-mono text-[#EDEDED]">
      <div className="mx-auto grid w-full max-w-md gap-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#EF9F27]">
            Remote Lens
          </p>
          <h1 className="mt-2 text-xl font-semibold">3D scan from your phone</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/58">
            Capture three clean arcs: top-down, eye-level, and slightly
            underneath. Yiiya will upload the video plus curated keyframes, then
            reconstruct outside the phone.
          </p>
        </div>

        <div className="grid gap-3 border border-[#1A1A1A] bg-white/[0.02] p-4 text-[11px] text-white/58">
          <p>
            Job {scanId.slice(0, 18)}...
          </p>
          <p>
            {job?.promptHint ?? "Single-object scan"}
          </p>
          <p>
            {job
              ? `Desktop status: ${job.captureStatus} · ${job.state} · ${progressLabel}`
              : "Desktop status: waiting for job sync"}
          </p>
          {job?.desktopUrl ? (
            <a
              href={job.desktopUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#EF9F27] underline decoration-[#EF9F27]/30 underline-offset-4"
            >
              Return to desktop
            </a>
          ) : null}
        </div>

        <div className="relative overflow-hidden border border-[#1A1A1A] bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-[14%] bottom-[12%] top-[12%] border border-white/18" />
            {silhouette ? (
              <div
                className="absolute border border-[#39FF14]/80 bg-[rgba(57,255,20,0.06)] shadow-[0_0_0_1px_rgba(57,255,20,0.12)]"
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
              <p className={`mt-1 text-sm font-semibold ${cameraReady ? "text-[#39FF14]" : "text-white/35"}`}>
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

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={cameraReady || cameraStarting}
              className="h-11 border border-[#1A1A1A] text-[11px] font-semibold uppercase tracking-[0.14em] text-white/78 transition hover:border-[#EF9F27]/60 hover:text-[#EF9F27] disabled:opacity-40"
            >
              {cameraStarting ? "Starting..." : cameraReady ? "Camera Ready" : "Enable Camera"}
            </button>
            <button
              type="button"
              onClick={() => void startCapture()}
              disabled={!cameraReady || isCapturing || isUploading}
              className="h-11 border border-[#1A1A1A] text-[11px] font-semibold uppercase tracking-[0.14em] text-white/78 transition hover:border-[#39FF14]/60 hover:text-[#39FF14] disabled:opacity-40"
            >
              {isCapturing ? "Capturing..." : "Start Capture"}
            </button>
            <button
              type="button"
              onClick={() => void finishCapture()}
              disabled={!isCapturing || isUploading}
              className="h-11 border border-[#1A1A1A] text-[11px] font-semibold uppercase tracking-[0.14em] text-white/78 transition hover:border-[#EF9F27]/60 hover:text-[#EF9F27] disabled:opacity-40"
            >
              {isUploading ? "Uploading..." : "Finish And Upload"}
            </button>
            <button
              type="button"
              onClick={() => stopCamera()}
              disabled={!cameraReady || isCapturing || isUploading}
              className="h-11 border border-[#1A1A1A] text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62 transition hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              Stop Camera
            </button>
          </div>

          <p className="text-xs leading-relaxed text-white/48">
            Matte objects will reconstruct best. Transparent glass, polished
            chrome, and clipped bottoms still need more caution and often need
            backend cleanup.
          </p>

          {keyframes.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">
                Curated keyframes · {keyframes.length}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {keyframes.slice(0, 8).map((frame) => (
                  <div
                    key={frame.id}
                    className="aspect-square overflow-hidden border border-[#1A1A1A] bg-black"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- keyframes are transient local data URLs captured from the camera. */}
                    <img
                      alt="Captured keyframe"
                      src={frame.previewDataUrl}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {job?.warnings.length ? (
            <div className="grid gap-2 border border-[#1A1A1A] bg-black/40 p-3 text-[11px] leading-relaxed">
              {job.warnings.slice(0, 3).map((warning) => (
                <p
                  key={warning.code}
                  className={
                    warning.severity === "error"
                      ? "text-[#ff8470]"
                      : warning.severity === "warning"
                        ? "text-[#EF9F27]"
                        : "text-white/60"
                  }
                >
                  {warning.label}
                </p>
              ))}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="border border-[#3A1B1B] bg-[#170b0b] px-3 py-2 text-[11px] text-[#ffb4a8]">
              {errorMessage}
            </div>
          ) : null}

          {job?.captureStatus === "uploaded" ? (
            <div className="border border-[#1A1A1A] bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-white/64">
              Upload complete. {finalStates.has(job.state)
                ? `Current backend status: ${job.state}.`
                : `Backend is now in ${stageLabel(job.stage)}.`}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
