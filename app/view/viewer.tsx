"use client";

/**
 * Public, shareable 3D viewer — the answer to "what do you do with the asset
 * after?". Every generated asset gets a URL you can text to anyone; they open
 * it and see the model orbiting in their browser, and on a phone they can tap
 * "View in your space" to drop it into AR. No account, no app, no backend
 * lookup — the durable GLB URL IS the share payload (?src=), so this page is
 * pure client + Google's <model-viewer> web component.
 */
import { Suspense, useEffect, useState, useRef, createElement } from "react";
import { ArtifactDownload } from "@/components/artifact-download";
import { useArtifactSource } from "@/lib/use-artifact-source";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resolveViewerSource } from "@/lib/scene/viewer-source";
import { assetStorageStatus } from "@/lib/assets/storage-status";

// jsdelivr specifically — it's the CDN allowlisted in the app's script-src CSP
// (unpkg is not), so this is the one host model-viewer will actually load from.
const MODEL_VIEWER_SRC =
  "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js";

function Viewer() {
  const params = useSearchParams();
  const rawSrc = params.get("src") ?? "";
  const name = (params.get("name") ?? "3D asset").slice(0, 80);
  const [ready, setReady] = useState(false);
  const [viewerError, setViewerError] = useState(false);
  const [modelError, setModelError] = useState(false);
  const modelRef = useRef<HTMLElement | null>(null);
  const source = resolveViewerSource(rawSrc);
  const { src, failed } = useArtifactSource(source);

  // Load model-viewer as a module and only render the custom element once it's
  // actually defined — more reliable than next/script for ESM custom elements.
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const markReady = () => {
      if (!cancelled) { setReady(true); setViewerError(false); clearTimeout(timer); }
    };
    if (customElements.get("model-viewer")) {
      markReady();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-model-viewer]');
    const s = existing ?? document.createElement("script");
    const failed = () => { if (!cancelled) setViewerError(true); };
    s.addEventListener("error", failed);
    timer = setTimeout(failed, 20_000);
    if (!existing) {
      s.type = "module";
      s.src = MODEL_VIEWER_SRC;
      s.dataset.modelViewer = "1";
      document.head.appendChild(s);
    }
    void customElements.whenDefined("model-viewer").then(markReady);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      s.removeEventListener("error", failed);
    };
  }, [src]);

  useEffect(() => {
    setModelError(false);
  }, [src]);

  useEffect(() => {
    const element = modelRef.current;
    if (!element) return;
    const failed = () => setModelError(true);
    element.addEventListener("error", failed);
    return () => element.removeEventListener("error", failed);
  }, [ready, src, modelError]);

  // Only render models from hosts we actually serve — keeps this from becoming
  // an open "render any URL" viewer while still covering every real asset
  // (Vercel Blob, our proxy, and the known provider CDNs).

  return (
    <div className="min-h-screen bg-[#050505] text-[#ededed] flex flex-col">
      <header className="px-5 py-3 flex items-center justify-between border-b border-zinc-900">
        <span className="text-[11px] font-mono tracking-[0.3em] text-zinc-500 uppercase">YIIYA</span>
        <Link
          href="/app"
          className="text-[10px] font-mono px-3 py-1.5 border border-[#EF9F27] text-[#EF9F27] hover:bg-[#EF9F27] hover:text-black transition-colors"
        >
          Make your own →
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        {!source ? (
          <div className="text-center text-[11px] font-mono text-zinc-600 leading-6 max-w-sm">
            No model to show — this link is missing or points somewhere we don&apos;t serve.
            <br />
            <Link href="/app" className="text-[#EF9F27] hover:underline">
              Generate one in the studio →
            </Link>
          </div>
        ) : viewerError || modelError || failed ? (
          <div role="alert" className="max-w-sm text-center text-sm text-zinc-300 space-y-3">
            <p>{modelError || failed ? "This model could not load. Its temporary link may have expired." : "The 3D viewer could not load. Check your connection and reload this page."}</p>
            <ArtifactDownload href={source} download="model.glb" className="text-[#EF9F27] underline">Try downloading the GLB</ArtifactDownload>
            <p className="text-xs text-zinc-400">AR is unavailable until the model loads.</p>
          </div>
        ) : ready && src ? (
          createElement("model-viewer", {
            ref: modelRef,
            src,
            alt: name,
            "camera-controls": true,
            "auto-rotate": true,
            "auto-rotate-delay": 0,
            "rotation-per-second": "20deg",
            ar: true,
            "ar-modes": "webxr scene-viewer quick-look",
            "shadow-intensity": "1",
            "environment-image": "neutral",
            "touch-action": "pan-y",
            style: {
              width: "100%",
              height: "min(78vh, 720px)",
              maxWidth: "900px",
              backgroundColor: "#050505"
            }
          })
        ) : (
          <div className="text-[11px] font-mono text-zinc-700">Loading viewer…</div>
        )}
      </main>

      <footer className="px-5 py-3 text-center border-t border-zinc-900">
        <p className="text-xs text-zinc-400 mb-2">AR requires a supported device and browser; otherwise use the 3D preview.</p>
        {assetStorageStatus(source) === "temporary" && <p className="text-xs text-amber-300 mb-2">This model uses temporary storage. Download a copy before the link expires.</p>}
        <span className="text-[10px] font-mono text-zinc-700">
          {name} · built with <span className="text-zinc-500">YIIYA</span> — say it, get a 3D asset
        </span>
      </footer>
    </div>
  );
}

export default function ViewerRoot() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
      <Viewer />
    </Suspense>
  );
}
