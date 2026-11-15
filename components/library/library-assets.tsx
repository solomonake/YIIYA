"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArtifactDownload } from "@/components/artifact-download";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { buildExportUrls } from "@/lib/scene/export-urls";

type AssetRow = {
  id: string;
  prompt: string;
  object_name: string;
  tier: string;
  glb_url: string;
  poster_url: string | null;
  triangle_count: number | null;
  scale_meters: number | null;
  export_formats: string[];
  created_at: string;
};

const TIER_LABEL: Record<string, string> = {
  hunyuan3d: "HY3D",
  trellis: "TRELLIS",
  library: "LIBRARY",
};

function AssetTile({ asset }: { asset: AssetRow }) {
  const urls = buildExportUrls(asset.glb_url);
  const [copied, setCopied] = useState(false);
  const created = new Date(asset.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const shareUrl =
    typeof window !== "undefined" && asset.glb_url
      ? `${window.location.origin}/view?src=${encodeURIComponent(asset.glb_url)}&name=${encodeURIComponent(asset.object_name)}`
      : "";

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: asset.object_name, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };

  return (
    <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-3 hover:border-zinc-700 transition-colors">
      <div className="aspect-square bg-zinc-900 rounded-sm mb-3 overflow-hidden flex items-center justify-center">
        {asset.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.poster_url}
            alt={asset.object_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[9px] font-mono text-zinc-700">no preview</span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[11px] font-mono text-zinc-200 truncate">
          {asset.object_name}
        </span>
        <span className="text-[8px] font-mono text-amber-500 shrink-0">
          {TIER_LABEL[asset.tier] ?? asset.tier.toUpperCase()}
        </span>
      </div>
      <div className="text-[9px] font-mono text-zinc-600 mb-2">{created}</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {Object.entries(urls).map(([fmt, url]) =>
          url ? (
            <ArtifactDownload
              key={fmt}
              href={url}
              download={`${asset.object_name}.${fmt}`}
              className="text-[8px] font-mono px-1.5 py-0.5 border border-zinc-700 rounded-sm text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            >
              .{fmt.toUpperCase()}
            </ArtifactDownload>
          ) : null,
        )}
      </div>
      <div className="flex gap-1 mb-1">
        <a
          href={shareUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center text-[9px] font-mono py-1.5 border border-[#EF9F27]/50 rounded-sm text-[#EF9F27] hover:bg-[#EF9F27] hover:text-black transition-colors"
        >
          View in AR
        </a>
        <button
          onClick={handleShare}
          className="flex-1 text-[9px] font-mono py-1.5 border border-zinc-800 rounded-sm text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
        >
          {copied ? "Link copied ✓" : "Share"}
        </button>
      </div>
      <Link
        href={`/app?assetId=${asset.id}`}
        className="block text-center text-[9px] font-mono py-1.5 border border-zinc-800 rounded-sm text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
      >
        Open in studio
      </Link>
    </div>
  );
}

type LibraryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; assets: AssetRow[] };

/** Mounted with a user key by the page: account changes discard all old state. */
export function LibraryAssets({ userId }: { userId: string }) {
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    // Also bounds a stalled client/transport that never settles after abort.
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setState({ status: "error" });
    }, 20_000);

    async function load() {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error("Library client unavailable");
        const { data, error } = await client
          .from("assets")
          .select(
            "id, prompt, object_name, tier, glb_url, poster_url, triangle_count, scale_meters, export_formats, created_at",
          )
          .eq("owner_id", userId)
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal);
        if (!active) return;
        if (error) throw error;
        setState({ status: "ready", assets: (data as AssetRow[]) ?? [] });
      } catch {
        if (active) setState({ status: "error" });
      } finally {
        clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [userId, attempt]);

  if (state.status === "loading")
    return (
      <p role="status" className="text-sm text-zinc-400">
        Loading your assets…
      </p>
    );
  if (state.status === "error")
    return (
      <section
        aria-labelledby="library-error-title"
        className="rounded-sm border border-zinc-700 p-5"
      >
        <div role="alert">
          <h2
            id="library-error-title"
            className="text-base font-medium text-zinc-200"
          >
            Library unavailable
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            We couldn&apos;t load your assets. Check your connection and try
            again.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
          className="mt-4 min-h-11 rounded-sm border border-amber-500 px-5 py-2 text-sm text-amber-400 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
        >
          Try again
        </button>
      </section>
    );
  if (!state.assets.length)
    return (
      <p className="text-sm leading-relaxed text-zinc-400">
        Nothing here yet. Generate something in the studio and it will show up
        here automatically.
      </p>
    );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {state.assets.map((asset) => (
        <AssetTile key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
