"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
// useState is used by AssetTile's share-copied state below.
import { useSupabaseSession } from "@/lib/auth/use-session";
import { AuthSheet } from "@/components/auth/auth-sheet";
import { signOut } from "@/lib/auth/actions";
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
  library: "LIBRARY"
};

function AssetTile({ asset }: { asset: AssetRow }) {
  const urls = buildExportUrls(asset.glb_url);
  const [copied, setCopied] = useState(false);
  const created = new Date(asset.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
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
          <img src={asset.poster_url} alt={asset.object_name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[9px] font-mono text-zinc-700">no preview</span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[11px] font-mono text-zinc-200 truncate">{asset.object_name}</span>
        <span className="text-[8px] font-mono text-amber-500 shrink-0">
          {TIER_LABEL[asset.tier] ?? asset.tier.toUpperCase()}
        </span>
      </div>
      <div className="text-[9px] font-mono text-zinc-600 mb-2">{created}</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {Object.entries(urls).map(([fmt, url]) =>
          url ? (
            <a
              key={fmt}
              href={url}
              download={`${asset.object_name}.${fmt}`}
              className="text-[8px] font-mono px-1.5 py-0.5 border border-zinc-700 rounded-sm text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            >
              .{fmt.toUpperCase()}
            </a>
          ) : null
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

export default function LibraryPage() {
  const { user, loading, isConfigured } = useSupabaseSession();
  const [showAuth, setShowAuth] = useState(false);
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAssets(null);
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) return;

    let cancelled = false;
    client
      .from("assets")
      .select(
        "id, prompt, object_name, tier, glb_url, poster_url, triangle_count, scale_meters, export_formats, created_at"
      )
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          return;
        }
        setAssets((data as AssetRow[]) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-black text-zinc-300">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[11px] font-mono text-zinc-500 tracking-widest">YIIYA · LIBRARY</div>
            <div className="text-[9px] font-mono text-zinc-700 mt-0.5">Your past products</div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/app" className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200">
              ← Studio
            </Link>
            {user ? (
              <button
                onClick={() => signOut()}
                className="text-[10px] font-mono text-zinc-500 hover:text-red-400"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="text-[10px] font-mono text-zinc-700">Loading…</div>
        ) : !isConfigured ? (
          <div className="text-[10px] font-mono text-zinc-600 leading-6">
            Auth isn&apos;t configured on this deployment yet.
          </div>
        ) : !user ? (
          <div className="border border-dashed border-zinc-800 rounded-sm p-8 text-center">
            <p className="text-[11px] font-mono text-zinc-400 mb-4">
              Sign in to see your past products.
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="px-4 py-2 bg-zinc-100 text-black text-[10px] font-mono rounded-sm hover:bg-white transition-colors"
            >
              Sign in
            </button>
          </div>
        ) : error ? (
          <div className="text-[10px] font-mono text-red-500">{error}</div>
        ) : assets === null ? (
          <div className="text-[10px] font-mono text-zinc-700">Loading your assets…</div>
        ) : assets.length === 0 ? (
          <div className="text-[10px] font-mono text-zinc-600 leading-6">
            Nothing here yet. Generate something in the studio — it&apos;ll show up here automatically.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {assets.map((asset) => (
              <AssetTile key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>

      {showAuth ? <AuthSheet onClose={() => setShowAuth(false)} /> : null}
    </div>
  );
}
