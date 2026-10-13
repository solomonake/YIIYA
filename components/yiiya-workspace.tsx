"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useYiiyaStore, type ReferenceImage } from "@/lib/store";
import { useSpeechInterpreter } from "@/lib/use-speech-interpreter";
import { PhoneCompanionOrbit } from "@/components/phone-companion-orbit";
import type { GeneratedAsset } from "@/lib/interpret-pipeline";
import { useSupabaseSession } from "@/lib/auth/use-session";
import { useOpenAssetFromLibrary } from "@/lib/assets/open-from-library";
import { AuthSheet } from "@/components/auth/auth-sheet";
import { signOut } from "@/lib/auth/actions";
import { SettingsSheet } from "@/components/settings-sheet";
import { classifyPromptSubject } from "@/lib/scene/prompt-intent";
import { canRecordTurntable, recordTurntable } from "@/lib/scene/turntable-recorder";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((m) => m.SceneCanvas),
  { ssr: false, loading: () => <div className="h-full w-full bg-black" /> }
);

// ─── Turntable recording ──────────────────────────────────────────────────────
// One clean 360° revolution captured straight off the WebGL canvas via
// captureStream + MediaRecorder — no server round-trip, no cost. Only
// meaningful for the currently-viewed asset, since it records whatever the
// canvas is showing right now.

function TurntableButton({ assetName }: { assetName: string }) {
  const [state, setState] = useState<"idle" | "recording" | "error">("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRecord = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (state === "recording") return;
      if (!canRecordTurntable()) {
        setState("error");
        setError("Turntable recording isn't supported in this browser.");
        return;
      }
      setState("recording");
      setError(null);
      try {
        const result = await recordTurntable(4000);
        setVideoUrl(result.blobUrl);
        setState("idle");
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Recording failed.");
      }
    },
    [state]
  );

  if (videoUrl) {
    return (
      <a
        href={videoUrl}
        download={`${assetName}-turntable.webm`}
        onClick={(e) => e.stopPropagation()}
        className="text-[8px] font-mono px-1.5 py-0.5 border border-emerald-800 rounded-sm text-emerald-400 hover:border-emerald-600 transition-colors"
      >
        ↓ TURNTABLE.WEBM
      </a>
    );
  }

  return (
    <button
      onClick={handleRecord}
      disabled={state === "recording"}
      title={error ?? "Record a 4-second 360° turntable clip"}
      className={`text-[8px] font-mono px-1.5 py-0.5 border rounded-sm transition-colors ${
        state === "recording"
          ? "border-amber-700 text-amber-400"
          : state === "error"
            ? "border-red-900 text-red-500"
            : "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
      }`}
    >
      {state === "recording" ? "RECORDING…" : "RECORD TURNTABLE"}
    </button>
  );
}

// ─── Asset Tray Card ─────────────────────────────────────────────────────────

// Curated chips that every parse to a FREE local material/scale edit (see
// classifyEditIntent → "local"). Kept in sync with lib/scene/local-edit.ts.
const FREE_EDIT_CHIPS = ["matte black", "chrome", "gold", "glossy", "bigger", "smaller"] as const;

/** Colour the readiness label so "draft" never reads as finished work. */
function readinessColor(label: "draft" | "preview" | "handoff") {
  if (label === "handoff") return "text-emerald-500";
  if (label === "preview") return "text-amber-500";
  return "text-zinc-500";
}

function AssetCard({ asset, isActive, onClick }: { asset: GeneratedAsset; isActive: boolean; onClick: () => void }) {
  const tierLabel = asset.tier === "hunyuan3d" ? "HY3D" : asset.tier === "trellis" ? "TRELLIS" : asset.tier === "library" ? "LIBRARY" : "FAILED";
  const tierColor = asset.tier === "hunyuan3d" ? "text-emerald-400" : asset.tier === "trellis" ? "text-blue-400" : asset.tier === "library" ? "text-amber-400" : "text-red-500";
  const hasExports = Object.keys(asset.exportUrls).length > 0;
  const poster = useYiiyaStore(s => s.assetPosters[asset.id]);
  const [copied, setCopied] = useState(false);

  const glbForShare = asset.exportUrls.glb ?? asset.glbUrl;
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window === "undefined" || !glbForShare) return;
    const url = `${window.location.origin}/view?src=${encodeURIComponent(glbForShare)}&name=${encodeURIComponent(asset.name)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: asset.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* dismissed */
    }
  };

  return (
    <div
      onClick={onClick}
      className={`border rounded-sm p-3 cursor-pointer transition-colors ${isActive ? "border-zinc-500 bg-zinc-900" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}
    >
      {poster ? (
        <div className="aspect-square w-full mb-2 overflow-hidden rounded-sm bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt={asset.name} className="w-full h-full object-cover" />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[10px] text-zinc-200 font-mono truncate">{asset.name}</span>
        <span className={`text-[8px] font-mono shrink-0 ${tierColor}`}>{tierLabel}</span>
      </div>
      <div className="text-[9px] text-zinc-600 font-mono mb-2">
        {asset.scaleMeters}m
        {asset.triangleCount ? ` · ${asset.triangleCount >= 1000 ? `${(asset.triangleCount / 1000).toFixed(1)}k` : asset.triangleCount} tris` : ""}
        {/* Readiness is measured; the old "watertight" label was inferred from
            the provider tier and never actually checked. */}
        {asset.readiness ? (
          <>
            {" · "}
            <span className={readinessColor(asset.readiness.label)}>
              {asset.readiness.score}% {asset.readiness.label}
            </span>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {hasExports ? (
          Object.entries(asset.exportUrls).map(([fmt, url]) =>
            url ? (
              <a
                key={fmt}
                href={url}
                download={`${asset.name}.${fmt}`}
                onClick={e => e.stopPropagation()}
                className="text-[8px] font-mono px-1.5 py-0.5 border border-zinc-700 rounded-sm text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
              >
                .{fmt.toUpperCase()}
              </a>
            ) : null
          )
        ) : (
          <span className="text-[8px] font-mono text-red-500/70">no exports — generation failed</span>
        )}
        {isActive && hasExports ? <TurntableButton assetName={asset.name} /> : null}
        {hasExports && glbForShare ? (
          <button
            onClick={handleShare}
            className="text-[8px] font-mono px-1.5 py-0.5 border border-[#EF9F27]/50 rounded-sm text-[#EF9F27] hover:bg-[#EF9F27] hover:text-black transition-colors"
          >
            {copied ? "copied ✓" : "share / AR"}
          </button>
        ) : null}
      </div>
      {asset.textureUrls?.albedo && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.textureUrls.albedo} alt="albedo" className="w-full h-10 object-cover rounded-sm opacity-50" />
        </div>
      )}
    </div>
  );
}

// ─── Intent preview ───────────────────────────────────────────────────────────
// Runs the same pure classifier the server uses, live, so users learn the
// object-vs-typography grammar ("a car" -> object, `the word "car"` -> text)
// before they hit submit instead of discovering it after a bad generation.

function IntentPreview({ text }: { text: string }) {
  const intent = classifyPromptSubject(text);
  return (
    <div className="px-3 pb-1.5 text-[8px] font-mono text-zinc-700">
      {intent.kind === "object" ? (
        <span>→ object: <span className="text-zinc-500">{intent.subject}</span></span>
      ) : (
        <span>→ 3D text: <span className="text-amber-700">&quot;{intent.subject}&quot;</span></span>
      )}
    </div>
  );
}

// ─── Starter prompts ──────────────────────────────────────────────────────────
// Plain example prompts, not pre-generated assets — they run through the same
// real provider cascade as anything else typed here. No fake "instant result"
// promise; just a running-start on wording that generates well.

const STARTER_PROMPTS = [
  "a ceramic coffee mug",
  "a leather armchair",
  "a vintage brass lamp",
  "a pair of running shoes",
  "a glass vase with flowers",
  "a wooden acoustic guitar"
];

function StarterPrompts({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {STARTER_PROMPTS.map((p) => (
        <button
          key={p}
          onClick={() => onPick(p)}
          className="text-[8px] font-mono px-2 py-1 border border-zinc-900 rounded-sm text-zinc-700 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

function LeftPanel({ open }: { open: boolean }) {
  const isListening = useYiiyaStore(s => s.isListening);
  const isInterpreting = useYiiyaStore(s => s.isInterpreting);
  const interimTranscript = useYiiyaStore(s => s.interimTranscript);
  const globalLogs = useYiiyaStore(s => s.logs);
  const assetLogs = useYiiyaStore(s => s.assetLogs);
  const activeAssetId = useYiiyaStore(s => s.activeAssetId);
  const generatedAssets = useYiiyaStore(s => s.generatedAssets);
  const logs = activeAssetId && assetLogs[activeAssetId]?.length
    ? assetLogs[activeAssetId]
    : globalLogs;
  const activeAsset =
    generatedAssets.find(a => a.id === activeAssetId) ??
    (generatedAssets.length ? generatedAssets[generatedAssets.length - 1] : null);
  // Only a real mesh can be edited for free in-browser; a failed/fallback tile can't.
  const canFreeEdit = Boolean(activeAsset && activeAsset.tier !== "fallback");
  const sessionStyleDNA = useYiiyaStore(s => s.sessionStyleDNA);
  const activeBrief = useYiiyaStore(s => s.activeBrief);
  const referenceImage = useYiiyaStore(s => s.referenceImage);
  const setReferenceImage = useYiiyaStore(s => s.setReferenceImage);
  const pendingClarify = useYiiyaStore(s => s.pendingClarify);
  const pendingEditConfirm = useYiiyaStore(s => s.pendingEditConfirm);
  const groundingPreviewUrl = useYiiyaStore(s => s.groundingPreviewUrl);
  const generationsRemaining = useYiiyaStore(s => s.generationsRemaining);
  const generationsLimit = useYiiyaStore(s => s.generationsLimit);
  const glbLoadFailed = useYiiyaStore(s => s.glbLoadFailed);
  const { toggleListening, submitManualTranscript, generateFromImage, cancelGeneration } = useSpeechInterpreter();
  const [manualText, setManualText] = useState("");
  const [clarifyReply, setClarifyReply] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPhoneOrbit, setShowPhoneOrbit] = useState(false);
  // The "Orbit with phone" affordance only makes sense on the fixed-camera
  // device (laptop/desktop). On a touch phone the user should just orbit here
  // via /capture, so hide the companion button there.
  const [canOrbitWithPhone, setCanOrbitWithPhone] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarse =
      window.matchMedia?.("(pointer: coarse)").matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setCanOrbitWithPhone(!coarse);
  }, []);

  // Phone finished its orbit and uploaded views: hydrate the reference image and
  // fire the SAME proven trigger the on-device orbit uses (set the ref, flag
  // ?autoGenerate=1, let the effect below submit). No bespoke generation path.
  const handleCompanionReady = useCallback(
    (ref: ReferenceImage) => {
      setShowPhoneOrbit(false);
      const url = new URL(window.location.href);
      url.searchParams.set("autoGenerate", "1");
      window.history.replaceState({}, "", url.toString());
      setReferenceImage(ref);
      useYiiyaStore.getState().addLog("[CAPTURE] Orbit received from phone — generating.");
    },
    [setReferenceImage]
  );

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInterpreting) return;
    if (manualText.trim()) {
      submitManualTranscript(manualText.trim());
      setManualText("");
    } else if (referenceImage) {
      // No prompt typed but an image is loaded → reconstruct the photo directly.
      generateFromImage();
    }
  };

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setReferenceImage({ base64, mediaType: file.type, name: file.name, previewUrl: dataUrl });
      useYiiyaStore.getState().addLog(`[REF] Loaded: ${file.name}`);
    };
    reader.readAsDataURL(file);
  }, [setReferenceImage]);

  if (!open) return null;

  const statusColor = isInterpreting ? "text-amber-400" : isListening ? "text-emerald-400" : "text-zinc-700";
  const statusLabel = isInterpreting ? "PROCESSING" : isListening ? "LISTENING" : "IDLE";

  return (
    // Full-screen overlay on narrow viewports (there's no room for a
    // side-by-side 3-pane layout on a phone); back to a fixed side column
    // at the sm breakpoint and up.
    <div className="fixed inset-0 z-30 sm:relative sm:inset-auto sm:z-auto flex flex-col h-full w-full sm:w-72 sm:shrink-0 bg-[#060606] border-r border-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-900 flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-mono text-zinc-500 tracking-widest">YIIYA · 3D STUDIO</div>
          {activeBrief && (
            <div className="text-[9px] font-mono text-zinc-700 truncate mt-0.5">
              {activeBrief.intent} · {activeBrief.primaryObject}
            </div>
          )}
          {sessionStyleDNA && (
            <div className="text-[9px] font-mono text-amber-700 truncate">STYLE: {sessionStyleDNA.styleLabel}</div>
          )}
        </div>
        <button
          onClick={() => useYiiyaStore.getState().setLeftPanelOpen(false)}
          className="sm:hidden shrink-0 text-zinc-600 hover:text-zinc-300 text-xs font-mono px-1"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Expired-asset notice: an older generation's provider URL can lapse, so
          the mesh 502s on load. Tell the user honestly and let them re-roll it. */}
      {glbLoadFailed && canFreeEdit && activeAsset ? (
        <div className="mx-3 mt-2 border border-red-900/60 bg-red-950/20 rounded-sm p-2.5">
          <div className="text-[9px] font-mono text-red-400 leading-4 mb-2">
            This asset&apos;s 3D file didn&apos;t load — older generations can expire.
            Re-generate it to view and download again.
          </div>
          <button
            onClick={() => {
              useYiiyaStore.getState().setGlbLoadFailed(false);
              submitManualTranscript(activeAsset.name, { forceGenerate: true });
            }}
            className="text-[8px] font-mono px-2 py-1 border border-red-800 bg-red-500/90 text-black rounded-sm hover:bg-red-400 transition-colors"
          >
            Re-generate &ldquo;{activeAsset.name}&rdquo;
          </button>
        </div>
      ) : null}

      {/* Log feed */}
      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[9px] leading-5">
        {logs.length === 0 && (
          <div className="text-zinc-800 mt-6 leading-6">
            Speak or type to generate 3D assets.<br />
            Hold SPACE for voice input.<br />
            Drop a reference image below.
            <StarterPrompts onPick={submitManualTranscript} />
          </div>
        )}
        {logs.map(entry => {
          const c =
            entry.label.startsWith("[ERROR]") ? "text-red-500" :
            entry.label.startsWith("[DONE]") || entry.label.startsWith("[READY]") ? "text-emerald-400" :
            entry.label.startsWith("[DIRECTOR]") ? "text-amber-400" :
            entry.label.startsWith("[GENERATOR]") ? "text-blue-400" :
            entry.label.startsWith("[USER]") ? "text-zinc-300" :
            entry.label.startsWith("[QA]") ? "text-zinc-500" :
            "text-zinc-700";
          return <div key={entry.id} className={`${c} mb-0.5 break-words`}>{entry.label}</div>;
        })}
        <div ref={logsEndRef} />
      </div>

      {/* Ambiguity gate: the Director paused before spending a paid generation.
          Answer a chip (resubmits enriched prompt), or generate anyway. */}
      {pendingClarify && !isInterpreting ? (
        <div className="mx-3 mb-2 border border-amber-900/60 bg-amber-950/20 rounded-sm p-2.5">
          <div className="text-[9px] font-mono text-amber-400 leading-4 mb-2">{pendingClarify.question}</div>
          {pendingClarify.previewImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pendingClarify.previewImage}
              alt="best-guess reference"
              className="h-16 w-16 object-cover rounded-sm border border-zinc-800 mb-2"
            />
          )}
          <div className="flex flex-wrap gap-1.5">
            {pendingClarify.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => submitManualTranscript(`${pendingClarify.transcript} — ${opt}`)}
                className="text-[8px] font-mono px-2 py-1 border border-amber-800/60 rounded-sm text-amber-300 hover:text-amber-100 hover:border-amber-500 transition-colors"
              >
                {opt}
              </button>
            ))}
            <button
              onClick={() => submitManualTranscript(pendingClarify.transcript, { forceGenerate: true })}
              className="text-[8px] font-mono px-2 py-1 border border-zinc-800 rounded-sm text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              generate anyway
            </button>
          </div>
          {/* Or answer in your own words — chips are shortcuts, not the ceiling. */}
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = clarifyReply.trim();
              if (!trimmed) return;
              submitManualTranscript(`${pendingClarify.transcript} — ${trimmed}`);
              setClarifyReply("");
            }}
          >
            <input
              type="text"
              value={clarifyReply}
              onChange={(e) => setClarifyReply(e.target.value)}
              placeholder="or type your answer..."
              className="flex-1 bg-zinc-950 border border-amber-900/40 rounded-sm px-2 py-1 text-[9px] font-mono text-amber-100 placeholder:text-zinc-700 focus:outline-none focus:border-amber-600"
            />
            <button
              type="submit"
              className="shrink-0 px-2 py-1 border border-amber-800/60 rounded-sm text-[9px] font-mono text-amber-300 hover:text-amber-100 hover:border-amber-500 transition-colors"
            >
              →
            </button>
          </form>
        </div>
      ) : null}

      {/* Edit-cost gate: a substantive change to the current mesh costs a full
          generation. Confirm before spending it — "ask users what they want"
          instead of silently regenerating (and producing a surprise new object). */}
      {pendingEditConfirm && !isInterpreting ? (
        <div className="mx-3 mb-2 border border-amber-900/60 bg-amber-950/20 rounded-sm p-2.5">
          <div className="text-[9px] font-mono text-amber-400 leading-4 mb-2">
            {pendingEditConfirm.mode === "restyle" ? (
              <>
                Restyle <span className="text-amber-200">{pendingEditConfirm.assetName}</span> as
                &ldquo;{pendingEditConfirm.transcript}&rdquo;? Keeps the shape and regenerates only the
                surface on Hugging Face&apos;s shared GPUs. Wait times vary. Your current mesh stays in the tray.
              </>
            ) : (
              <>
                Regenerate <span className="text-amber-200">{pendingEditConfirm.assetName}</span> as
                &ldquo;{pendingEditConfirm.transcript}&rdquo;? This spends one generation (1–4 min).
                Your current mesh stays in the tray.
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                const { transcript: t, mode } = pendingEditConfirm;
                useYiiyaStore.getState().setPendingEditConfirm(null);
                submitManualTranscript(t, { forceGenerate: true, ...(mode === "restyle" ? { editMode: "restyle" as const } : {}) });
              }}
              className="text-[8px] font-mono px-2 py-1 border border-amber-700 bg-amber-500 text-black rounded-sm hover:bg-amber-400 transition-colors"
            >
              {pendingEditConfirm.mode === "restyle" ? "Yes — restyle (keeps shape)" : "Yes — regenerate (1 gen)"}
            </button>
            <button
              onClick={() => useYiiyaStore.getState().setPendingEditConfirm(null)}
              className="text-[8px] font-mono px-2 py-1 border border-zinc-800 rounded-sm text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
            >
              No — keep current
            </button>
          </div>
        </div>
      ) : null}

      {/* Free reference preview: what the 3D build is following, shown the
          moment it exists — catch a misread before the paid part finishes. */}
      {groundingPreviewUrl && isInterpreting ? (
        <div className="mx-3 mb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={groundingPreviewUrl}
            alt="generation reference"
            className="h-12 w-12 object-cover rounded-sm border border-zinc-800"
          />
          <span className="text-[8px] font-mono text-zinc-600 leading-3">
            Building from this reference (free preview)
          </span>
        </div>
      ) : null}

      {/* Free instant-edit chips — every one routes through the local-edit fast
          path (0 tokens, no regeneration), teaching the free loop so users stop
          accidentally spending a generation on "make it darker". */}
      {canFreeEdit && !isInterpreting && !pendingClarify && !pendingEditConfirm ? (
        <div className="px-3 pb-2">
          <p className="text-[8px] font-mono text-zinc-700 tracking-widest uppercase mb-1">
            Free instant edits · no generation
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FREE_EDIT_CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => submitManualTranscript(c)}
                className="text-[8px] font-mono px-2 py-1 border border-emerald-900/50 rounded-sm text-emerald-400/80 hover:text-emerald-200 hover:border-emerald-600 transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeBrief?.suggestions && activeBrief.suggestions.length > 0 && !isInterpreting && !pendingClarify ? (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {activeBrief.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => submitManualTranscript(s)}
              className="text-[8px] font-mono px-2 py-1 border border-zinc-800 rounded-sm text-zinc-500 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* Status */}
      <div className="px-3 py-1 border-t border-zinc-900 flex items-center gap-2">
        <span className={`text-[8px] font-mono ${statusColor}`}>{statusLabel}</span>
        {interimTranscript && <span className="text-[8px] font-mono text-zinc-600 italic truncate">&quot;{interimTranscript}&quot;</span>}
        {generationsRemaining !== null && generationsLimit !== null ? (
          <span
            className={`ml-auto text-[8px] font-mono ${generationsRemaining <= 2 ? "text-amber-500" : "text-zinc-700"}`}
            title="Free 3D generations left today · free instant edits don't count"
          >
            {generationsRemaining}/{generationsLimit} gens left today
          </span>
        ) : null}
      </div>

      {/* Reference image drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mx-3 mb-2 border border-dashed rounded-sm p-2 cursor-pointer transition-colors ${
          referenceImage ? "border-amber-800 bg-amber-950/10" : "border-zinc-900 hover:border-zinc-700"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              setReferenceImage({ base64: dataUrl.split(",")[1], mediaType: file.type, name: file.name, previewUrl: dataUrl });
            };
            reader.readAsDataURL(file);
          }}
        />
        {referenceImage ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={referenceImage.previewUrl} alt="ref" className="h-9 w-9 object-cover rounded-sm" />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono text-amber-500 truncate">{referenceImage.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); if (!isInterpreting) generateFromImage(); }}
                  disabled={isInterpreting}
                  className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm border border-emerald-800 bg-emerald-950/40 text-emerald-400 hover:border-emerald-600 disabled:opacity-40"
                >
                  Generate 3D →
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }}
                  className="text-[8px] font-mono text-zinc-700 hover:text-zinc-400"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[9px] font-mono text-zinc-800 text-center">Drop or click — photo → 3D</div>
        )}
      </div>

      {/* Orbit-with-phone: real geometry on a fixed-camera laptop. A single
          webcam photo guesses the unseen sides; scanning a QR lets the phone do
          the walk-around and ship 3 views back. */}
      {canOrbitWithPhone && (
        <button
          onClick={() => setShowPhoneOrbit(true)}
          className="mx-3 mb-2 w-[calc(100%-1.5rem)] rounded-sm border border-zinc-900 py-1.5 text-[9px] font-mono text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
        >
          📱 Orbit with phone — real 3D, not a guessed backside
        </button>
      )}
      {showPhoneOrbit && (
        <PhoneCompanionOrbit
          onReady={handleCompanionReady}
          onClose={() => setShowPhoneOrbit(false)}
        />
      )}

      {/* Hint / cancel bar */}
      <div className="px-3 pb-1 flex items-center justify-between">
        <span className="text-[8px] font-mono text-zinc-700">
          {isListening ? "Listening — release to send" : isInterpreting ? "Generating…" : "Hold SPACE to talk · or type"}
        </span>
        {isInterpreting && (
          <button
            onClick={cancelGeneration}
            className="text-[8px] font-mono text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-900/60 rounded-sm px-1.5 py-0.5"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Live intent preview — teaches the object-vs-typography grammar as you type */}
      {manualText.trim() ? <IntentPreview text={manualText} /> : null}

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-3 pb-3 flex gap-2">
        <button
          type="button"
          onClick={toggleListening}
          title="Hold SPACE or click to talk"
          aria-label="Voice input"
          className={`shrink-0 w-8 h-8 rounded-sm border flex items-center justify-center transition-all ${
            isListening ? "border-emerald-600 bg-emerald-950/60 text-emerald-400 animate-pulse" :
            isInterpreting ? "border-amber-700 bg-amber-950/40 text-amber-400" :
            "border-zinc-800 bg-zinc-900 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1c-2.2 0-4 1.8-4 4v7c0 2.2 1.8 4 4 4s4-1.8 4-4V5c0-2.2-1.8-4-4-4zm-7 10c0 3.9 3.1 7 7 7s7-3.1 7-7h-2c0 2.8-2.2 5-5 5s-5-2.2-5-5H5zm7 9v-2h-1v2H9v2h6v-2h-2z"/>
          </svg>
        </button>
        <input
          type="text"
          value={manualText}
          onChange={e => setManualText(e.target.value)}
          placeholder={referenceImage ? "describe it, or press → to use photo" : "describe a 3D asset…"}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1.5 text-[10px] font-mono text-zinc-300 placeholder:text-zinc-800 focus:outline-none focus:border-zinc-600"
        />
        <button
          type="submit"
          disabled={isInterpreting || (!manualText.trim() && !referenceImage)}
          className="shrink-0 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-sm text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:hover:bg-zinc-900"
        >
          →
        </button>
      </form>
      {/* Cost transparency: what a submission actually costs, before committing. */}
      <div className="px-3 pb-2 -mt-1 text-[8px] font-mono text-zinc-800">
        new object ≈ 1 paid generation · color/finish/size edits: free &amp; instant
        <span className="block">click a part of the model, then say &quot;make this red&quot;</span>
      </div>
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function RightPanel({ open }: { open: boolean }) {
  const generatedAssets = useYiiyaStore(s => s.generatedAssets);
  const activeAssetId = useYiiyaStore(s => s.activeAssetId);
  const setActiveAsset = useYiiyaStore(s => s.setActiveAsset);
  const clearScene = useYiiyaStore(s => s.clearScene);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 sm:relative sm:inset-auto sm:z-auto flex flex-col h-full w-full sm:w-64 sm:shrink-0 bg-[#060606] border-l border-zinc-900">
      <div className="px-3 py-2.5 border-b border-zinc-900 flex items-center justify-between">
        <span className="text-[9px] font-mono text-zinc-600 tracking-widest">ASSET TRAY</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-zinc-700">{generatedAssets.length}</span>
          <button
            onClick={() => useYiiyaStore.getState().setRightPanelOpen(false)}
            className="sm:hidden text-zinc-600 hover:text-zinc-300 text-xs font-mono px-1"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {generatedAssets.length === 0 && (
          <div className="text-[9px] font-mono text-zinc-800 px-1 pt-6 leading-5">
            Assets appear here after generation.
          </div>
        )}
        {[...generatedAssets].reverse().map(asset => (
          <AssetCard
            key={asset.id}
            asset={asset}
            isActive={asset.id === activeAssetId}
            onClick={() => setActiveAsset(asset.id)}
          />
        ))}
      </div>

      {generatedAssets.length > 0 && (
        <div className="p-2 border-t border-zinc-900">
          <button
            onClick={clearScene}
            className="w-full text-[9px] font-mono text-zinc-700 hover:text-red-500 py-1.5 border border-zinc-900 hover:border-red-900/50 rounded-sm transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Generating overlay ───────────────────────────────────────────────────────

function GeneratingOverlay() {
  const isInterpreting = useYiiyaStore(s => s.isInterpreting);
  const logs = useYiiyaStore(s => s.logs);
  if (!isInterpreting) return null;
  const last = logs[logs.length - 1]?.label ?? "Processing...";
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className="bg-black/80 border border-zinc-800 rounded-sm px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[9px] font-mono text-zinc-400 max-w-xs truncate">{last}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Undo/redo (asset history) ────────────────────────────────────────────────

function stepAssetHistory(direction: 1 | -1) {
  const store = useYiiyaStore.getState();
  const assets = store.generatedAssets;
  if (assets.length === 0) return;
  const currentIndex = assets.findIndex((a) => a.id === store.activeAssetId);
  const base = currentIndex === -1 ? assets.length - 1 : currentIndex;
  const nextIndex = Math.max(0, Math.min(assets.length - 1, base + direction));
  store.setActiveAsset(assets[nextIndex].id);
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar() {
  const leftOpen = useYiiyaStore(s => s.leftPanelOpen);
  const rightOpen = useYiiyaStore(s => s.rightPanelOpen);
  const setLeft = useYiiyaStore(s => s.setLeftPanelOpen);
  const setRight = useYiiyaStore(s => s.setRightPanelOpen);
  const assetCount = useYiiyaStore(s => s.generatedAssets.length);
  const { user, isConfigured } = useSupabaseSession();
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="absolute top-3 right-3 z-20 flex gap-1.5">
      {assetCount > 1 && (
        <div className="flex gap-0.5" title="Undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)">
          <button
            onClick={() => stepAssetHistory(-1)}
            className="px-1.5 py-1 text-[9px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
            aria-label="Previous asset"
          >
            ‹
          </button>
          <button
            onClick={() => stepAssetHistory(1)}
            className="px-1.5 py-1 text-[9px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
            aria-label="Next asset"
          >
            ›
          </button>
        </div>
      )}
      <button
        onClick={() => setLeft(!leftOpen)}
        className="px-2 py-1 text-[8px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
      >
        {leftOpen ? "HIDE LOG" : "LOG"}
      </button>
      <button
        onClick={() => setRight(!rightOpen)}
        className="px-2 py-1 text-[8px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
      >
        ASSETS{assetCount > 0 ? ` (${assetCount})` : ""}
      </button>
      <Link
        href="/capture"
        className="px-2 py-1 text-[8px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
      >
        CAPTURE
      </Link>
      {isConfigured && (
        <>
          <Link
            href="/library"
            className="px-2 py-1 text-[8px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
          >
            LIBRARY
          </Link>
          {user ? (
            <button
              onClick={() => signOut()}
              className="px-2 py-1 text-[8px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
            >
              SIGN OUT
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="px-2 py-1 text-[8px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
            >
              SIGN IN
            </button>
          )}
        </>
      )}
      <button
        onClick={() => setShowSettings(true)}
        className="px-2 py-1 text-[8px] font-mono border border-zinc-800 rounded-sm bg-black/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 backdrop-blur-sm transition-colors"
        aria-label="Settings"
      >
        ⚙
      </button>
      {showAuth ? <AuthSheet onClose={() => setShowAuth(false)} /> : null}
      {showSettings ? <SettingsSheet onClose={() => setShowSettings(false)} /> : null}
    </div>
  );
}

// ─── Main Workspace ───────────────────────────────────────────────────────────

export function YiiyaWorkspace() {
  const leftOpen = useYiiyaStore(s => s.leftPanelOpen);
  const rightOpen = useYiiyaStore(s => s.rightPanelOpen);
  const generatedAssets = useYiiyaStore(s => s.generatedAssets);
  const activeAssetId = useYiiyaStore(s => s.activeAssetId);
  const addLog = useYiiyaStore(s => s.addLog);
  const referenceImage = useYiiyaStore(s => s.referenceImage);
  const { submitManualTranscript: autoSubmit } = useSpeechInterpreter();

  // Restores the persisted session (assets, logs, history) after the initial
  // hydration-matching render. See the skipHydration comment in lib/store.ts
  // for why this can't just happen automatically on store creation.
  useEffect(() => {
    void useYiiyaStore.persist.rehydrate();
  }, []);

  useOpenAssetFromLibrary();

  // Mobile-first load: the log panel defaults open for desktop parity, but
  // on a narrow viewport it would cover the entire 3D canvas on first paint.
  // One-time check on mount (not a resize listener — the user's own
  // LOG/ASSETS toggles take over from here).
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      useYiiyaStore.getState().setLeftPanelOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orbit capture flow: /capture sets referenceImage (with additionalViews)
  // in the store then navigates here with ?autoGenerate=1. Fire the
  // generation once the image is actually in the store, then scrub the query
  // param so a refresh doesn't re-trigger it.
  useEffect(() => {
    if (typeof window === "undefined" || !referenceImage) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoGenerate") !== "1") return;

    params.delete("autoGenerate");
    const url = new URL(window.location.href);
    url.search = params.toString();
    window.history.replaceState({}, "", url.toString());

    autoSubmit("Generate a 3D model of this object.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceImage]);

  // Multi-object capture queue: /capture parks one ReferenceImage per tapped
  // object in the store (an explicit "N objects -> N generations" tap is the
  // consent), and this effect consumes them one at a time — the next item
  // fires only after the current generation settles. If a queued generation
  // produces NO new asset (provider failure, quota 429), the queue clears
  // instead of burning the remaining generations on a broken run.
  const isQueueInterpreting = useYiiyaStore(s => s.isInterpreting);
  const captureQueueLength = useYiiyaStore(s => s.captureQueue.length);
  const queueGuardRef = useRef<{ assetCountAtSubmit: number } | null>(null);
  useEffect(() => {
    if (isQueueInterpreting || captureQueueLength === 0) {
      if (captureQueueLength === 0) queueGuardRef.current = null;
      return;
    }

    const state = useYiiyaStore.getState();
    const guard = queueGuardRef.current;
    if (guard && state.generatedAssets.length <= guard.assetCountAtSubmit) {
      state.setCaptureQueue([]);
      queueGuardRef.current = null;
      addLog(
        `[CAPTURE] Stopping the queue — the last object didn't generate. ${captureQueueLength} object${captureQueueLength === 1 ? "" : "s"} skipped, no generations spent on them.`
      );
      return;
    }

    const next = state.consumeCaptureQueue();
    if (!next) return;
    queueGuardRef.current = { assetCountAtSubmit: state.generatedAssets.length };
    // Re-read: `state` is a pre-consume snapshot, so its queue is stale.
    const position = useYiiyaStore.getState().captureQueue.length;
    addLog(
      position > 0
        ? `[CAPTURE] Generating "${next.name}" — ${position} more queued after this.`
        : `[CAPTURE] Generating "${next.name}".`
    );
    autoSubmit("Generate a 3D model of this object.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQueueInterpreting, captureQueueLength]);

  // Undo/redo over the asset generation history: Cmd/Ctrl+Z steps back to
  // the previous asset, Cmd/Ctrl+Shift+Z steps forward. Deliberately not a
  // full state-snapshot undo system — the generated-assets array already IS
  // an append-only history, so "undo" is just "view the previous one" and
  // costs nothing to implement or get wrong.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      e.preventDefault();
      stepAssetHistory(e.shiftKey ? 1 : -1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const key = "yiiya_3d_boot";
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    addLog("[SYSTEM] YIIYA 3D Studio ready.");
    addLog("[SYSTEM] Hold SPACE to speak · Drop image for photo-to-3D");
    addLog("[SYSTEM] Pipeline: Gemini director → studio photo → TRELLIS.2 / Hunyuan3D / Tripo cascade → validated GLB");
  }, [addLog]);

  const activeAsset =
    generatedAssets.find(a => a.id === activeAssetId) ??
    (generatedAssets.length > 0 ? generatedAssets[generatedAssets.length - 1] : null);
  const activeGlbUrl = activeAsset?.glbUrl ?? null;

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden">
      <LeftPanel open={leftOpen} />

      <div className="relative flex-1 min-w-0">
        <Toolbar />
        <Suspense fallback={<div className="h-full w-full bg-black" />}>
          <SceneCanvas
            activeGlbUrl={activeGlbUrl}
            activeAssetDbId={activeAsset?.dbId}
            activeAssetLocalId={activeAsset?.id}
            activeMaterialOverride={activeAsset?.materialOverride}
          />
        </Suspense>
        <GeneratingOverlay />
      </div>

      <RightPanel open={rightOpen} />
    </div>
  );
}
