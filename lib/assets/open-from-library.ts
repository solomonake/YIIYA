"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { buildExportUrls } from "@/lib/scene/export-urls";
import { useYiiyaStore } from "@/lib/store";
import type { GeneratedAsset } from "@/lib/interpret-pipeline";

type AssetRow = {
  id: string;
  object_name: string;
  tier: string;
  glb_url: string;
  triangle_count: number | null;
  scale_meters: number | null;
  brief_json: { materialBrief?: GeneratedAsset["materialBrief"]; textureUrls?: GeneratedAsset["textureUrls"] } | null;
};

/**
 * Reopens a past product from /library. Reads `?assetId=` directly from
 * window.location (not next/navigation's useSearchParams) so this client-only
 * concern doesn't force a Suspense boundary on an otherwise fully-interactive
 * page. RLS scopes the query to the signed-in owner automatically — an
 * anonymous or mismatched-owner request just returns no rows, silently.
 */
export function useOpenAssetFromLibrary() {
  const addGeneratedAsset = useYiiyaStore((s) => s.addGeneratedAsset);
  const addLog = useYiiyaStore((s) => s.addLog);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const assetId = new URLSearchParams(window.location.search).get("assetId");
    if (!assetId) return;

    const client = getSupabaseBrowserClient();
    if (!client) return;

    let cancelled = false;
    client
      .from("assets")
      .select("id, object_name, tier, glb_url, triangle_count, scale_meters, brief_json")
      .eq("id", assetId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as AssetRow;
        const asset: GeneratedAsset = {
          id: `library-${row.id}`,
          dbId: row.id,
          name: row.object_name,
          glbUrl: row.glb_url,
          tier: row.tier as GeneratedAsset["tier"],
          triangleCount: row.triangle_count ?? undefined,
          materialBrief: row.brief_json?.materialBrief ?? {
            baseColor: "#808080",
            metalness: 0,
            roughness: 0.7,
            textureStyle: "pbr-realistic"
          },
          textureUrls: row.brief_json?.textureUrls ?? undefined,
          exportUrls: buildExportUrls(row.glb_url),
          scaleMeters: row.scale_meters ?? 1,
          isWatertight: row.tier !== "fallback"
        };
        addGeneratedAsset(asset);
        addLog(`[LIBRARY] Reopened "${asset.name}" from your history.`);

        // Drop the query param so a refresh doesn't re-add the same asset.
        const url = new URL(window.location.href);
        url.searchParams.delete("assetId");
        window.history.replaceState({}, "", url.toString());
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
