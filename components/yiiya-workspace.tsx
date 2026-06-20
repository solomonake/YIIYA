"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useYiiyaStore } from "@/lib/store";
import { useSpeechInterpreter } from "@/lib/use-speech-interpreter";
import type { GeneratedAsset } from "@/lib/interpret-pipeline";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((m) => m.SceneCanvas),
  { ssr: false, loading: () => <div className="h-full w-full bg-black" /> }
);

// ─── Asset Tray Card ─────────────────────────────────────────────────────────

function AssetCard({ asset, isActive, onClick }: { asset: GeneratedAsset; isActive: boolean; onClick: () => void }) {
  const tierLabel = asset.tier === "hunyuan3d" ? "HY3D" : asset.tier === "trellis" ? "TRELLIS" : asset.tier === "library" ? "LIBRARY" : "PREVIEW";
  const tierColor = asset.tier === "hunyuan3d" ? "text-emerald-400" : asset.tier === "trellis" ? "text-blue-400" : asset.tier === "library" ? "text-amber-400" : "text-zinc-600";

  return (
    <div
      onClick={onClick}
      className={`border rounded-sm p-3 cursor-pointer transition-colors ${isActive ? "border-zinc-500 bg-zinc-900" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[10px] text-zinc-200 font-mono truncate">{asset.name}</span>
        <span className={`text-[8px] font-mono shrink-0 ${tierColor}`}>{tierLabel}</span>
      </div>
      <div className="text-[9px] text-zinc-600 font-mono mb-2">{asset.scaleMeters}m · {asset.isWatertight ? "watertight" : "approx"}</div>
      <div className="flex flex-wrap gap-1">
        {Object.entries(asset.exportUrls).map(([fmt, url]) =>
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
        )}
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

// ─── Left Panel ───────────────────────────────────────────────────────────────

function LeftPanel({ open }: { open: boolean }) {
  const isListening = useYiiyaStore(s => s.isListening);
  const isInterpreting = useYiiyaStore(s => s.isInterpreting);
  const interimTranscript = useYiiyaStore(s => s.interimTranscript);
  const logs = useYiiyaStore(s => s.logs);
  const sessionStyleDNA = useYiiyaStore(s => s.sessionStyleDNA);
  const activeBrief = useYiiyaStore(s => s.activeBrief);
  const referenceImage = useYiiyaStore(s => s.referenceImage);
  const setReferenceImage = useYiiyaStore(s => s.setReferenceImage);
  const { toggleListening, submitManualTranscript } = useSpeechInterpreter();
  const [manualText, setManualText] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualText.trim()) {
      submitManualTranscript(manualText.trim());
      setManualText("");
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
    <div className="flex flex-col h-full w-72 shrink-0 bg-[#060606] border-r border-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-900">
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

      {/* Log feed */}
      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[9px] leading-5">
        {logs.length === 0 && (
          <div className="text-zinc-800 mt-6 leading-6">
            Speak or type to generate 3D assets.<br />
            Hold SPACE for voice input.<br />
            Drop a reference image below.
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

      {/* Status */}
      <div className="px-3 py-1 border-t border-zinc-900 flex items-center gap-2">
        <span className={`text-[8px] font-mono ${statusColor}`}>{statusLabel}</span>
        {interimTranscript && <span className="text-[8px] font-mono text-zinc-600 italic truncate">&quot;{interimTranscript}&quot;</span>}
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
            <img src={referenceImage.previewUrl} alt="ref" className="h-8 w-8 object-cover rounded-sm" />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono text-amber-500 truncate">{referenceImage.name}</div>
              <button
                onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }}
                className="text-[8px] font-mono text-zinc-700 hover:text-zinc-400"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[9px] font-mono text-zinc-800 text-center">Drop reference image</div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-3 pb-3 flex gap-2">
        <button
          type="button"
          onClick={toggleListening}
          title="Hold SPACE or click"
          className={`shrink-0 w-8 h-8 rounded-sm border flex items-center justify-center transition-all ${
            isListening ? "border-emerald-600 bg-emerald-950/60 text-emerald-400" :
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
          placeholder="describe a 3D asset..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1.5 text-[10px] font-mono text-zinc-300 placeholder:text-zinc-800 focus:outline-none focus:border-zinc-600"
        />
        <button
          type="submit"
          className="shrink-0 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-sm text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          →
        </button>
      </form>
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
    <div className="flex flex-col h-full w-64 shrink-0 bg-[#060606] border-l border-zinc-900">
      <div className="px-3 py-2.5 border-b border-zinc-900 flex items-center justify-between">
        <span className="text-[9px] font-mono text-zinc-600 tracking-widest">ASSET TRAY</span>
        <span className="text-[9px] font-mono text-zinc-700">{generatedAssets.length}</span>
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

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar() {
  const leftOpen = useYiiyaStore(s => s.leftPanelOpen);
  const rightOpen = useYiiyaStore(s => s.rightPanelOpen);
  const setLeft = useYiiyaStore(s => s.setLeftPanelOpen);
  const setRight = useYiiyaStore(s => s.setRightPanelOpen);
  const assetCount = useYiiyaStore(s => s.generatedAssets.length);

  return (
    <div className="absolute top-3 right-3 z-20 flex gap-1.5">
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

  useEffect(() => {
    const key = "yiiya_3d_boot";
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    addLog("[SYSTEM] YIIYA 3D Studio ready.");
    addLog("[SYSTEM] Hold SPACE to speak · Drop image for photo-to-3D");
    addLog("[SYSTEM] Pipeline: Gemini → Pollinations studio photo → TRELLIS-2 / Hunyuan3D-2.5 / InstantMesh cascade");
  }, [addLog]);

  const activeGlbUrl = (() => {
    const active = generatedAssets.find(a => a.id === activeAssetId);
    if (active) return active.glbUrl;
    if (generatedAssets.length > 0) return generatedAssets[generatedAssets.length - 1].glbUrl;
    return null;
  })();

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden">
      <LeftPanel open={leftOpen} />

      <div className="relative flex-1 min-w-0">
        <Toolbar />
        <Suspense fallback={<div className="h-full w-full bg-black" />}>
          <SceneCanvas activeGlbUrl={activeGlbUrl} />
        </Suspense>
        <GeneratingOverlay />
      </div>

      <RightPanel open={rightOpen} />
    </div>
  );
}
