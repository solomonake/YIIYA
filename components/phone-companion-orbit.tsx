"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import type { ReferenceImage } from "@/lib/store";

type Phase = "creating" | "waiting" | "hydrating" | "expired" | "error";

const POLL_MS = 2000;

/**
 * Convert a hosted (Blob) view URL into the base64 shape the generation
 * pipeline expects. The laptop never captured these frames — the phone did and
 * uploaded them — so we re-fetch and inline them here.
 */
async function urlToView(url: string): Promise<{ base64: string; mediaType: string; dataUrl: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`view fetch ${res.status}`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
  return {
    base64: dataUrl.split(",")[1] ?? "",
    mediaType: blob.type || "image/png",
    dataUrl
  };
}

/**
 * "Orbit with phone" — the laptop half of the phone-companion flow.
 *
 * Creates a capture session, shows its QR, and polls until the phone finishes an
 * orbit and uploads 3 views. On success it hands a fully-formed `ReferenceImage`
 * (front + additionalViews) to `onReady`, which the workspace feeds into the
 * proven `?autoGenerate=1` path. Every failure mode (expired session, fetch
 * error) is surfaced with an explicit retry — nothing silently spins forever.
 */
export function PhoneCompanionOrbit({
  onReady,
  onClose
}: {
  onReady: (ref: ReferenceImage) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("creating");
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against a late poll resolving after the component unmounts / a view
  // fetch racing a second poll.
  const doneRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const beginSession = useCallback(async () => {
    doneRef.current = false;
    setPhase("creating");
    setErrorMsg(null);
    setCaptureUrl(null);
    stopPolling();
    try {
      const res = await fetch("/api/capture-session", { method: "POST" });
      if (!res.ok) throw new Error(`create ${res.status}`);
      const data = (await res.json()) as { id: string; captureUrl: string };
      sessionIdRef.current = data.id;
      setCaptureUrl(data.captureUrl);
      setPhase("waiting");
    } catch {
      setPhase("error");
      setErrorMsg("Couldn't start a session. Check your connection and retry.");
    }
  }, [stopPolling]);

  // Poll the session while waiting for the phone.
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = sessionIdRef.current;
    if (!id) return;

    const tick = async () => {
      if (doneRef.current) return;
      let res: Response;
      try {
        res = await fetch(`/api/capture-session/${id}`);
      } catch {
        return; // transient network blip — keep polling
      }
      if (res.status === 404) {
        doneRef.current = true;
        stopPolling();
        setPhase("expired");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { status: string; views: string[] }
        | null;
      if (!data || data.status !== "ready" || data.views.length === 0) return;

      // Views are in! Stop polling and hydrate.
      doneRef.current = true;
      stopPolling();
      setPhase("hydrating");
      try {
        const views = await Promise.all(data.views.map(urlToView));
        const [front, ...rest] = views;
        onReady({
          base64: front.base64,
          mediaType: front.mediaType,
          name: "orbit-front.png",
          previewUrl: front.dataUrl,
          additionalViews: rest.map((v) => ({ base64: v.base64, mediaType: v.mediaType }))
        });
      } catch {
        setPhase("error");
        setErrorMsg("Received the orbit but couldn't load the frames. Retry.");
      }
    };

    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [phase, onReady, stopPolling]);

  // Kick off the first session on mount, and clean up on unmount.
  useEffect(() => {
    void beginSession();
    return () => {
      doneRef.current = true;
      stopPolling();
    };
  }, [beginSession, stopPolling]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-xs rounded-md border border-zinc-800 bg-zinc-950 p-5 flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest text-zinc-500">
            ORBIT WITH PHONE
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[11px] font-mono text-zinc-600 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {phase === "creating" && (
          <div className="py-10 text-[11px] font-mono text-zinc-500">Starting a session…</div>
        )}

        {phase === "waiting" && captureUrl && (
          <>
            <div className="rounded-sm bg-white p-3">
              <QRCodeSVG value={captureUrl} size={168} level="M" />
            </div>
            <div className="text-center">
              <p className="text-[11px] font-mono text-zinc-300">Scan with your phone</p>
              <p className="mt-1 text-[9px] font-mono text-zinc-600">
                Walk around the object once — your laptop generates the moment the phone finishes.
              </p>
            </div>
          </>
        )}

        {phase === "hydrating" && (
          <div className="py-10 text-[11px] font-mono text-emerald-400">
            Orbit received — generating…
          </div>
        )}

        {phase === "expired" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-[11px] font-mono text-amber-400">This session expired.</p>
            <button
              onClick={beginSession}
              className="rounded-sm border border-zinc-700 px-3 py-1.5 text-[10px] font-mono text-zinc-300 hover:text-white"
            >
              Show a fresh QR
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-[11px] font-mono text-red-400">{errorMsg}</p>
            <button
              onClick={beginSession}
              className="rounded-sm border border-zinc-700 px-3 py-1.5 text-[10px] font-mono text-zinc-300 hover:text-white"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
