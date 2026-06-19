"use client";
// @ts-nocheck

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  emptyCoverage,
  surfaceCoverageConfidence,
  type CoverageCell,
} from "@/lib/scan-coverage";
import { useYiiyaStore } from "@/lib/store";
import type { ScanExportSummary, ScanJobSummary } from "@/lib/scan-types";

const terminalStates = new Set<ScanJobSummary["state"]>([
  "complete",
  "failed",
  "cancelled",
]);

function stageLabel(stage: ScanJobSummary["stage"]) {
  return stage.replaceAll("_", " ");
}

function previewImageForJob(job: ScanJobSummary | null) {
  if (!job) {
    return null;
  }

  return (
    job.latestFrame?.previewImageUrl ??
    job.latestFrame?.previewDataUrl ??
    job.assets.find((asset) => asset.kind === "preview")?.url ??
    job.uploads.find((upload) => upload.kind === "preview")?.url ??
    job.uploads.find((upload) => upload.kind === "keyframe")?.url ??
    null
  );
}

function preferredSceneExport(job: ScanJobSummary | null) {
  if (!job) {
    return null;
  }

  return (
    job.exports.find(
      (item) =>
        item.status === "ready" &&
        item.format === "glb" &&
        item.tier === "creator",
    ) ??
    job.exports.find(
      (item) =>
        item.status === "ready" &&
        item.format === "glb" &&
        item.tier === "mobile-preview",
    ) ??
    null
  );
}

function syncScanJobQuery(scanId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("scanJob", scanId);
  window.history.replaceState({}, "", url);
}

function exportLabel(exportItem: ScanExportSummary) {
  return `${exportItem.tier} · ${exportItem.format.toUpperCase()}`;
}

function reportTone(status: ScanJobSummary["stageReports"][number]["status"]) {
  switch (status) {
    case "ready":
      return {
        borderColor: "rgba(57,255,20,0.28)",
        background: "rgba(57,255,20,0.08)",
        color: "rgba(220,255,220,0.82)",
      };
    case "fallback":
    case "heuristic":
      return {
        borderColor: "rgba(239,159,39,0.32)",
        background: "rgba(239,159,39,0.08)",
        color: "rgba(255,228,188,0.82)",
      };
    case "deferred":
    case "needs-input":
      return {
        borderColor: "rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        color: "rgba(255,255,255,0.58)",
      };
    case "failed":
      return {
        borderColor: "rgba(255,132,112,0.3)",
        background: "rgba(255,132,112,0.08)",
        color: "rgba(255,210,204,0.82)",
      };
    default:
      return {
        borderColor: "rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        color: "rgba(255,255,255,0.62)",
      };
  }
}

function metadataAsset(job: ScanJobSummary | null, fileName: string) {
  return (
    job?.assets.find(
      (asset) =>
        asset.kind === "metadata" &&
        asset.fileName.toLowerCase() === fileName.toLowerCase(),
    ) ?? null
  );
}

export function ScanStudioPanel() {
  const searchParams = useSearchParams();
  const activeLane = useYiiyaStore((state) => state.activeLane);
  const scanJob = useYiiyaStore((state) => state.scanJob);
  const setScanJob = useYiiyaStore((state) => state.setScanJob);
  const setActiveLane = useYiiyaStore((state) => state.setActiveLane);
  const setCreationGoal = useYiiyaStore((state) => state.setCreationGoal);
  const addSceneObject = useYiiyaStore((state) => state.addSceneObject);
  const addLog = useYiiyaStore((state) => state.addLog);
  const [open, setOpen] = useState(false);
  const [isStarting, setStarting] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);
  const [isLoadingIntoScene, setLoadingIntoScene] = useState(false);
  const [isCancelling, setCancelling] = useState(false);

  const refreshScanJob = useCallback(
    async (scanId: string, silent = false) => {
      if (!silent) {
        setRefreshing(true);
      }

      try {
        const response = await fetch(`/api/scan/jobs/${scanId}`);
        const payload = (await response.json().catch(() => null)) as
          | ScanJobSummary
          | { error?: string }
          | null;

        if (response.ok && payload && "id" in payload) {
          setScanJob(payload);
          syncScanJobQuery(payload.id);
        }
      } finally {
        if (!silent) {
          setRefreshing(false);
        }
      }
    },
    [setScanJob],
  );

  useEffect(() => {
    if (activeLane !== "scan") {
      setOpen(false);
    }
  }, [activeLane]);

  useEffect(() => {
    const scanId = searchParams.get("scanJob");

    if (!scanId) {
      return;
    }

    setActiveLane("scan");
    setOpen(true);
    void refreshScanJob(scanId, true);
  }, [refreshScanJob, searchParams, setActiveLane]);

  useEffect(() => {
    if (!open || !scanJob?.id) {
      return;
    }

    const delay =
      scanJob.captureStatus === "uploaded" || terminalStates.has(scanJob.state)
        ? 2200
        : 1200;
    const intervalId = window.setInterval(() => {
      void refreshScanJob(scanJob.id, true);
    }, delay);

    return () => window.clearInterval(intervalId);
  }, [
    open,
    refreshScanJob,
    scanJob?.captureStatus,
    scanJob?.id,
    scanJob?.state,
  ]);

  const coverage = useMemo<CoverageCell[]>(
    () => scanJob?.coverage ?? emptyCoverage(),
    [scanJob?.coverage],
  );
  const overallCoverage = surfaceCoverageConfidence(coverage);
  const previewImage = previewImageForJob(scanJob);
  const sceneExport = preferredSceneExport(scanJob);
  const manifestAsset = metadataAsset(scanJob, "manifest.json");
  const repairLogAsset = metadataAsset(scanJob, "repair-log.json");
  const isTerminal = scanJob ? terminalStates.has(scanJob.state) : false;
  const keyframeCount =
    scanJob?.uploads.filter((upload) => upload.kind === "keyframe").length ?? 0;
  const progressPercent = Math.round((scanJob?.progress ?? 0) * 100);

  if (activeLane !== "scan") {
    return null;
  }

  const startScan = async () => {
    setStarting(true);
    setActiveLane("scan");
    setCreationGoal("scan");

    try {
      const response = await fetch("/api/scan/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptHint:
            useYiiyaStore.getState().activeBrief?.summary ??
            "Scan a real object",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        job?: ScanJobSummary;
        error?: string;
      } | null;

      if (!response.ok || !payload?.job?.id) {
        throw new Error(
          payload?.error ?? `Scan start failed with ${response.status}`,
        );
      }

      setScanJob(payload.job);
      syncScanJobQuery(payload.job.id);
      setOpen(true);
      addLog("[SCAN]: Durable scan job created.");
    } catch (error) {
      addLog(
        `[SCAN]: ${error instanceof Error ? error.message : "Unable to start scan."}`,
      );
    } finally {
      setStarting(false);
    }
  };

  const loadIntoScene = async () => {
    if (!scanJob || !sceneExport?.url) {
      return;
    }

    setLoadingIntoScene(true);

    try {
      setActiveLane("mesh");
      addSceneObject({
        source: "scan",
        scanResultId: scanJob.id,
        prompt: scanJob.objectHint ?? scanJob.promptHint ?? "scanned object",
        resolvedName: scanJob.objectHint ?? "scanned object",
        tier: "generated",
        modelUrl: sceneExport.url,
        meshUrl: sceneExport.url,
        style: "product-clay",
        generationStatus: "ready",
        shape: "mesh",
        material: "matte",
        color: "#EDEDED",
        animation: "float",
        position: [0, 0.8, 0],
        scale: [1, 1, 1],
      });
      addLog(
        `[SCAN]: Loaded ${sceneExport.tier} ${sceneExport.format.toUpperCase()} into the scene.`,
      );
    } finally {
      setLoadingIntoScene(false);
    }
  };

  const cancelJob = async () => {
    if (!scanJob) {
      return;
    }

    setCancelling(true);

    try {
      const response = await fetch(`/api/scan/jobs/${scanJob.id}/cancel`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | ScanJobSummary
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Cancel failed with ${response.status}`,
        );
      }

      setScanJob(payload);
      addLog("[SCAN]: Scan job cancelled.");
    } catch (error) {
      addLog(
        `[SCAN]: ${error instanceof Error ? error.message : "Cancel failed."}`,
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="yiiya-panel pointer-events-auto absolute bottom-28 left-5 z-30 w-[286px] p-3 font-mono text-white/62">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber">
              Scan Studio
            </p>
            <span className="border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/36">
              Labs
            </span>
          </div>
          <p className="mt-1 text-[10px] text-white/36">
            advanced phone-to-desktop reconstruction
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="text-[10px] uppercase tracking-[0.14em] text-white/42 transition hover:text-amber"
        >
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {!open ? (
        <div className="mt-3 grid gap-2">
          <p className="text-[10px] leading-relaxed text-white/42">
            Use a phone capture to reconstruct a real object. Scan jobs stay
            queued outside the quick generator so heavy reconstruction does not
            block export.
          </p>
          <button
            type="button"
            onClick={() => void startScan()}
            disabled={isStarting}
            className="h-9 w-full border border-terminalBorder text-[11px] font-bold uppercase tracking-[0.12em] text-white/72 transition hover:border-amber/70 hover:text-amber disabled:border-white/5 disabled:text-white/25"
          >
            {isStarting ? "Starting..." : "Start Scan"}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {!scanJob ? (
            <>
              <p className="text-[11px] text-white/42">
                Create a scan job to capture on your phone and reconstruct in
                the background.
              </p>
              <button
                type="button"
                onClick={() => void startScan()}
                disabled={isStarting}
                className="h-9 w-full border border-terminalBorder text-[11px] font-bold uppercase tracking-[0.12em] text-white/72 transition hover:border-amber/70 hover:text-amber disabled:border-white/5 disabled:text-white/25"
              >
                {isStarting ? "Starting..." : "Create Scan Job"}
              </button>
            </>
          ) : (
            <>
              <Image
                alt="Scan QR code"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(scanJob.mobileUrl)}`}
                width={160}
                height={160}
                unoptimized
                className="mx-auto h-40 w-40 border border-terminalBorder bg-white p-2"
              />
              <a
                href={scanJob.mobileUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[11px] text-amber underline decoration-amber/30 underline-offset-4"
              >
                {scanJob.mobileUrl}
              </a>

              {previewImage ? (
                <div
                  className="h-24 border border-terminalBorder bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${previewImage})`,
                  }}
                />
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                {coverage.slice(0, 9).map((cell) => (
                  <div
                    key={cell.id}
                    className="h-8 border"
                    style={{
                      borderColor: cell.covered
                        ? "rgba(57,255,20,0.45)"
                        : "#1A1A1A",
                      background: cell.covered
                        ? "rgba(57,255,20,0.14)"
                        : "rgba(255,255,255,0.02)",
                    }}
                    title={cell.label}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.14em]">
                {coverage.slice(9).map((cell) => (
                  <div
                    key={cell.id}
                    className="border px-2 py-2 text-center"
                    style={{
                      borderColor: cell.covered
                        ? "rgba(239,159,39,0.35)"
                        : "#1A1A1A",
                      color: cell.covered
                        ? "#EF9F27"
                        : "rgba(255,255,255,0.32)",
                    }}
                  >
                    {cell.label.replace("-depth", "")}
                  </div>
                ))}
              </div>

              <div className="grid gap-1 text-[10px] uppercase tracking-[0.14em] text-white/44">
                <p>
                  Capture {scanJob.captureStatus} · {scanJob.state}
                </p>
                <p>
                  Stage {stageLabel(scanJob.stage)} · Progress {progressPercent}
                  %
                </p>
                <p>
                  Surface {Math.round(overallCoverage * 100)}% · Depth{" "}
                  {Math.round((scanJob.latestFrame?.depthScore ?? 0) * 100)}% ·
                  Keyframes {keyframeCount}
                </p>
              </div>

              {scanJob.latestFrame?.guidance ? (
                <p className="text-[10px] leading-relaxed text-white/38">
                  {scanJob.latestFrame.guidance}
                </p>
              ) : null}

              {scanJob.warnings.length > 0 ? (
                <div className="grid gap-2 border border-white/10 bg-white/[0.02] p-2 text-[10px] leading-relaxed text-white/50">
                  {scanJob.warnings.slice(0, 3).map((warning) => (
                    <p
                      key={warning.code}
                      className={
                        warning.severity === "error"
                          ? "text-[#ff8470]"
                          : warning.severity === "warning"
                            ? "text-[#EF9F27]"
                            : "text-white/56"
                      }
                    >
                      {warning.label}
                    </p>
                  ))}
                </div>
              ) : null}

              {scanJob.stageReports.length > 0 ? (
                <div className="grid gap-2 border border-white/10 bg-white/[0.02] p-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-white/40">
                    <span>Pipeline notes</span>
                    {scanJob.repairSummary?.usedFallbackMesh ? (
                      <span className="text-amber/80">fallback mesh</span>
                    ) : null}
                  </div>
                  <div className="grid gap-1">
                    {scanJob.stageReports.map((report) => (
                      <div
                        key={`${report.stage}-${report.status}`}
                        className="border px-2 py-2 text-[10px]"
                        style={reportTone(report.status)}
                      >
                        <div className="flex items-center justify-between gap-2 uppercase tracking-[0.12em]">
                          <span>{stageLabel(report.stage)}</span>
                          <span>{report.status}</span>
                        </div>
                        {report.detail ? (
                          <p className="mt-1 leading-relaxed text-white/58">
                            {report.detail}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {manifestAsset?.url || repairLogAsset?.url ? (
                    <div className="flex flex-wrap gap-3 text-[10px]">
                      {manifestAsset?.url ? (
                        <a
                          href={manifestAsset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-white/58 underline decoration-white/15 underline-offset-4 hover:text-bone"
                        >
                          Capture manifest
                        </a>
                      ) : null}
                      {repairLogAsset?.url ? (
                        <a
                          href={repairLogAsset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber underline decoration-amber/30 underline-offset-4"
                        >
                          Repair log
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-2 border border-white/10 bg-white/[0.02] p-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                  Exports
                </p>
                {scanJob.exports.length === 0 ? (
                  <p className="text-[10px] leading-relaxed text-white/34">
                    Waiting for upload completion before packaging exports.
                  </p>
                ) : (
                  scanJob.exports.map((exportItem) => (
                    <div
                      key={exportItem.id}
                      className="flex items-center justify-between gap-3 text-[10px]"
                    >
                      <span className="truncate text-white/54">
                        {exportLabel(exportItem)}
                      </span>
                      {exportItem.status === "ready" && exportItem.url ? (
                        <a
                          href={exportItem.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber underline decoration-amber/30 underline-offset-4"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-white/32">
                          {exportItem.status === "failed"
                            ? "failed"
                            : "pending"}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => void loadIntoScene()}
                  disabled={!sceneExport?.url || isLoadingIntoScene}
                  className="h-9 border border-terminalBorder text-[11px] font-bold uppercase tracking-[0.12em] text-white/72 transition hover:border-amber/70 hover:text-amber disabled:border-white/5 disabled:text-white/25"
                >
                  {isLoadingIntoScene ? "Loading..." : "Load Mesh Into Scene"}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshScanJob(scanJob.id)}
                  disabled={isRefreshing}
                  className="h-9 border border-terminalBorder text-[11px] uppercase tracking-[0.12em] text-white/52 transition hover:border-white/20 hover:text-bone disabled:border-white/5 disabled:text-white/25"
                >
                  {isRefreshing ? "Refreshing..." : "Refresh Job"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(scanJob.mobileUrl)
                  }
                  className="h-9 border border-terminalBorder text-[11px] uppercase tracking-[0.12em] text-white/52 transition hover:border-white/20 hover:text-bone"
                >
                  Copy Mobile Link
                </button>
                {!isTerminal ? (
                  <button
                    type="button"
                    onClick={() => void cancelJob()}
                    disabled={isCancelling}
                    className="h-9 border border-[#3A1B1B] text-[11px] uppercase tracking-[0.12em] text-[#ff9b8b] transition hover:border-[#ff8470]/60 hover:text-[#ffb4a8] disabled:border-white/5 disabled:text-white/25"
                  >
                    {isCancelling ? "Cancelling..." : "Cancel Job"}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
