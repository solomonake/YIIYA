"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { runTranscriptThroughYiiya } from "@/lib/use-speech-interpreter";
import { useYiiyaStore } from "@/lib/store";
import { emptyCoverage, surfaceCoverageConfidence, type CoverageCell } from "@/lib/scan-coverage";

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  return {
    mediaType: match[1] ?? "image/jpeg",
    base64: match[2] ?? ""
  };
}

export function ScanStudioPanel() {
  const searchParams = useSearchParams();
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const creationGoal = useYiiyaStore((state) => state.creationGoal);
  const scanSession = useYiiyaStore((state) => state.scanSession);
  const setScanSession = useYiiyaStore((state) => state.setScanSession);
  const setReferenceImage = useYiiyaStore((state) => state.setReferenceImage);
  const setCreationGoal = useYiiyaStore((state) => state.setCreationGoal);
  const addLog = useYiiyaStore((state) => state.addLog);
  const [open, setOpen] = useState(false);
  const [isStarting, setStarting] = useState(false);

  useEffect(() => {
    if (canvasMode !== "3D" && creationGoal !== "scan") {
      setOpen(false);
    }
  }, [canvasMode, creationGoal]);

  useEffect(() => {
    const sessionId = searchParams.get("scanSession");

    if (!sessionId) {
      return;
    }

    setOpen(true);
    void fetch(`/api/scan/session/${sessionId}`)
      .then((response) => response.json())
      .then((session) => {
        if (!session?.id) {
          return;
        }

        setScanSession(session);
      })
      .catch(() => null);
  }, [searchParams, setScanSession]);

  useEffect(() => {
    if (!scanSession || !open) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetch(`/api/scan/session/${scanSession.id}`)
        .then((response) => response.json())
        .then((session) => {
          if (!session?.id) {
            return;
          }

          setScanSession(session);
        })
        .catch(() => null);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [open, scanSession, setScanSession]);

  const coverage = useMemo<CoverageCell[]>(
    () => scanSession?.coverage ?? emptyCoverage(),
    [scanSession]
  );
  const overallCoverage = surfaceCoverageConfidence(coverage);

  if (canvasMode === "WEB" && creationGoal !== "scan") {
    return null;
  }

  const startScan = async () => {
    setStarting(true);
    setCreationGoal("scan");

    try {
      const response = await fetch("/api/scan/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptHint: useYiiyaStore.getState().activeBrief?.summary ?? "Scan a real object"
        })
      });
      const session = await response.json();
      setScanSession(session);
      setOpen(true);
      addLog("[SCAN]: Remote lens session created.");
    } catch (error) {
      addLog(`[SCAN]: ${error instanceof Error ? error.message : "Unable to start session."}`);
    } finally {
      setStarting(false);
    }
  };

  const polishScan = async () => {
    if (!scanSession?.latestFrame?.previewDataUrl) {
      return;
    }

    const parsed = parseDataUrl(scanSession.latestFrame.previewDataUrl);

    if (!parsed) {
      return;
    }

    setReferenceImage({
      base64: parsed.base64,
      mediaType: parsed.mediaType,
      name: `scan-${scanSession.id}.jpg`,
      previewUrl: scanSession.latestFrame.previewDataUrl,
      imageMode: "3d"
    });
    setCreationGoal("scan");
    addLog("[SCAN]: Captured frame sent to the 3D pipeline.");
    await runTranscriptThroughYiiya(
      `Turn this scanned ${scanSession.objectHint ?? "object"} into a polished 3D mockup`
    );
  };

  return (
    <div className="pointer-events-auto absolute bottom-28 left-5 z-30 w-[240px] border border-terminalBorder bg-[#050505]/94 p-3 font-mono text-white/62 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber">
            Scan Studio
          </p>
          <p className="mt-1 text-[10px] text-white/36">
            phone-to-desktop capture
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
          <p className="text-[10px] leading-relaxed text-white/40">
            Use this only in 3D mode when you want phone capture. Website references should come through screenshot upload.
          </p>
          <button
            type="button"
            onClick={() => void startScan()}
            disabled={isStarting}
            className="h-9 w-full border border-terminalBorder text-[11px] font-bold uppercase tracking-[0.12em] text-white/72 transition hover:border-amber/70 hover:text-amber disabled:opacity-50"
          >
            {isStarting ? "Starting..." : "Start Scan"}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {!scanSession ? (
            <p className="text-[11px] text-white/42">Create a session to scan from your phone.</p>
          ) : (
            <>
              <img
                alt="Scan QR code"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(scanSession.mobileUrl)}`}
                className="mx-auto h-40 w-40 border border-terminalBorder bg-white p-2"
              />
              <a
                href={scanSession.mobileUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[11px] text-amber underline decoration-amber/30 underline-offset-4"
              >
                {scanSession.mobileUrl}
              </a>
              {scanSession.latestFrame?.previewDataUrl ? (
                <div
                  className="h-24 border border-terminalBorder bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${scanSession.latestFrame.previewDataUrl})`
                  }}
                />
              ) : null}
              <div className="grid grid-cols-3 gap-2">
                {coverage.slice(0, 9).map((cell) => (
                  <div
                    key={cell.id}
                    className="h-8 border"
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
              <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.14em]">
                {coverage.slice(9).map((cell) => (
                  <div
                    key={cell.id}
                    className="border px-2 py-2 text-center"
                    style={{
                      borderColor: cell.covered ? "rgba(239,159,39,0.35)" : "#1A1A1A",
                      color: cell.covered ? "#EF9F27" : "rgba(255,255,255,0.32)"
                    }}
                  >
                    {cell.label.replace("-depth", "")}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-white/44">
                Surface {Math.round(overallCoverage * 100)}% · Depth {Math.round((scanSession.latestFrame?.depthScore ?? 0) * 100)}% · {scanSession.status}
              </p>
              {scanSession.latestFrame?.guidance ? (
                <p className="text-[10px] leading-relaxed text-white/38">
                  {scanSession.latestFrame.guidance}
                </p>
              ) : null}
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => void polishScan()}
                  disabled={!scanSession.latestFrame?.previewDataUrl}
                  className="h-9 border border-terminalBorder text-[11px] font-bold uppercase tracking-[0.12em] text-white/72 transition hover:border-amber/70 hover:text-amber disabled:opacity-40"
                >
                  Polish Into Studio
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(scanSession.mobileUrl)}
                  className="h-9 border border-terminalBorder text-[11px] uppercase tracking-[0.12em] text-white/52 transition hover:border-white/20 hover:text-bone"
                >
                  Copy Mobile Link
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
