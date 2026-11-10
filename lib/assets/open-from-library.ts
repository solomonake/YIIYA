"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { useSupabaseSession } from "@/lib/auth/use-session";
import { buildExportUrls } from "@/lib/scene/export-urls";
import { parseQualityReward } from "@/lib/scene/quality-reward";
import { readOwnedAsset } from "./read-owned-asset";
import { useYiiyaStore } from "@/lib/store";
import type { GeneratedAsset } from "@/lib/interpret-pipeline";

type AssetRow = {
  id: string;
  object_name: string;
  tier: string;
  glb_url: string;
  triangle_count: number | null;
  scale_meters: number | null;
  brief_json: { materialBrief?: GeneratedAsset["materialBrief"]; textureUrls?: GeneratedAsset["textureUrls"]; qualityReward?: unknown } | null;
};

/**
 * Reopens a past product from /library. Reads `?assetId=` directly from
 * window.location (not next/navigation's useSearchParams) so this client-only
 * concern doesn't force a Suspense boundary on an otherwise fully-interactive
 * page. Waits for sign-in, filters by owner in addition to RLS, and cancels
 * stale reads when auth changes. The URL is retained on failure for retry.
 */
export function useOpenAssetFromLibrary() {
  const addGeneratedAsset = useYiiyaStore((s) => s.addGeneratedAsset);
  const addLog = useYiiyaStore((s) => s.addLog);
  const { user, loading, isConfigured } = useSupabaseSession();
  const userId = user?.id;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const assetId = new URLSearchParams(window.location.search).get("assetId");
    if (!assetId || loading) return;
    if (!isConfigured) {
      addLog("[LIBRARY] Could not open this model: sign-in is unavailable on this deployment.");
      return;
    }
    if (!userId) {
      addLog("[LIBRARY] Sign in to reopen this model.");
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      addLog("[LIBRARY] Could not open this model. Refresh and try again.");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      controller.abort();
      addLog("[LIBRARY] Loading this model timed out. Refresh to retry.");
    }, 15_000);
    void (async () => {
      try {
        const { data, error } = await readOwnedAsset(client, userId, assetId, controller.signal);
        if (cancelled) return;
        if (error) {
          addLog("[LIBRARY] Could not load this model. Refresh to retry.");
          return;
        }
        if (!data) {
          addLog("[LIBRARY] This model is not available in your account. Check the link or switch accounts.");
          return;
        }
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
          qualityReward: parseQualityReward(row.brief_json?.qualityReward),
          exportUrls: buildExportUrls(row.glb_url),
          scaleMeters: row.scale_meters ?? 1,
          // Unknown, not inferred from tier — see runPackager in interpret-pipeline.
          isWatertight: undefined
        };
        addGeneratedAsset(asset);
        addLog(`[LIBRARY] Reopened "${asset.name}" from your history.`);

        // Drop the query param so a refresh doesn't re-add the same asset.
        const url = new URL(window.location.href);
        url.searchParams.delete("assetId");
        window.history.replaceState({}, "", url.toString());
      } catch {
        if (!cancelled) addLog("[LIBRARY] Could not load this model. Check your connection and refresh to retry.");
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [userId, loading, isConfigured, addGeneratedAsset, addLog]);
}
