"use client";

/**
 * Public, shareable 3D viewer — the answer to "what do you do with the asset
 * after?". Every generated asset gets a URL you can text to anyone; they open
 * it and see the model orbiting in their browser, and on a phone they can tap
 * "View in your space" to drop it into AR. No account, no app, no backend
 * lookup — the durable GLB URL IS the share payload (?src=), so this page is
 * pure client + Google's <model-viewer> web component.
 */
import { Suspense, useEffect, useState, createElement } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { isAllowedProviderUrl } from "@/lib/provider-hosts";

// jsdelivr specifically — it's the CDN allowlisted in the app's script-src CSP
// (unpkg is not), so this is the one host model-viewer will actually load from.
const MODEL_VIEWER_SRC =
  "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js";

function Viewer() {
  const params = useSearchParams();
  const rawSrc = params.get("src") ?? "";
  const name = (params.get("name") ?? "3D asset").slice(0, 80);
  const [ready, setReady] = useState(false);

  // Load model-viewer as a module and only render the custom element once it's
  // actually defined — more reliable than next/script for ESM custom elements.
  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setReady(true);
    };
    if (customElements.get("model-viewer")) {
      markReady();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-model-viewer]');
    if (!existing) {
      const s = document.createElement("script");
      s.type = "module";
      s.src = MODEL_VIEWER_SRC;
      s.dataset.modelViewer = "1";
      document.head.appendChild(s);
    }
    void customElements.whenDefined("model-viewer").then(markReady);
    return () => {
      cancelled = true;
    };
  }, []);

  // Only render models from hosts we actually serve — keeps this from becoming
  // an open "render any URL" viewer while still covering every real asset
  // (Vercel Blob, our proxy, and the known provider CDNs).
  const src = isAllowedProviderUrl(rawSrc) ? rawSrc : "";

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
        {!src ? (
          <div className="text-center text-[11px] font-mono text-zinc-600 leading-6 max-w-sm">
            No model to show — this link is missing or points somewhere we don&apos;t serve.
            <br />
            <Link href="/app" className="text-[#EF9F27] hover:underline">
              Generate one in the studio →
            </Link>
          </div>
        ) : ready ? (
          createElement("model-viewer", {
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
