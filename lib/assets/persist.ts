import { serviceClient } from "@/lib/supabase-server";
import type { GeneratedAsset } from "@/lib/interpret-pipeline";

/**
 * Saves a successful generation to `public.assets` so the signed-in user can
 * find it again in /library. Failed generations (tier "fallback") are not
 * persisted — there is nothing useful to revisit. Uses the service-role
 * client (bypasses RLS) with an explicit owner_id, the same pattern the
 * publish route already uses; the row is still only ever readable by that
 * owner because of the table's RLS policy.
 *
 * Returns the new row id (used to later attach a poster thumbnail), or null
 * if saving isn't possible (Supabase not configured, insert failed). Never
 * throws — persistence is best-effort and must never break generation.
 */
export async function saveGeneratedAsset(
  userId: string,
  prompt: string,
  sessionId: string | null | undefined,
  asset: GeneratedAsset
): Promise<string | null> {
  if (asset.tier === "fallback") return null;

  const client = serviceClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("assets")
      .insert({
        owner_id: userId,
        session_id: sessionId ?? null,
        prompt,
        object_name: asset.name,
        tier: asset.tier,
        glb_url: asset.glbUrl,
        triangle_count: asset.triangleCount ?? null,
        scale_meters: asset.scaleMeters,
        brief_json: { materialBrief: asset.materialBrief, textureUrls: asset.textureUrls ?? null },
        export_formats: Object.keys(asset.exportUrls)
      })
      .select("id")
      .single();

    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

/**
 * Prompt→asset cache: returns the most recent successful asset this user
 * already generated for the EXACT same prompt, or null. Re-running a prompt
 * you already paid for should cost nothing — the row carries everything
 * needed to rehydrate the asset (glb_url is durable: Blob or the proxy).
 * Scoped to the owner; anonymous users have no history to hit.
 *
 * Accepts multiple candidate keys because retextured assets are cached under
 * a mesh-scoped key (lib/meshy-retexture.ts retextureCacheKey) alongside the
 * plain transcript key — the most recent match across all keys wins.
 */
export type CachedAssetRow = {
  id: string;
  object_name: string;
  tier: string;
  glb_url: string;
  triangle_count: number | null;
  scale_meters: number | null;
  brief_json: { materialBrief?: unknown; textureUrls?: unknown } | null;
};

export async function findCachedAsset(
  userId: string,
  prompts: string[]
): Promise<CachedAssetRow | null> {
  const client = serviceClient();
  if (!client || prompts.length === 0) return null;

  try {
    const { data, error } = await client
      .from("assets")
      .select("id, object_name, tier, glb_url, triangle_count, scale_meters, brief_json")
      .eq("owner_id", userId)
      .in("prompt", prompts)
      .neq("tier", "fallback")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as CachedAssetRow;
  } catch {
    return null;
  }
}

/**
 * Attaches a poster thumbnail URL to a previously saved asset, scoped to the
 * requesting user so one user can't overwrite another's asset row.
 */
export async function attachPosterUrl(
  userId: string,
  assetId: string,
  posterUrl: string
): Promise<boolean> {
  const client = serviceClient();
  if (!client) return false;

  try {
    const { error, count } = await client
      .from("assets")
      .update({ poster_url: posterUrl }, { count: "exact" })
      .eq("id", assetId)
      .eq("owner_id", userId);
    return !error && (count ?? 0) > 0;
  } catch {
    return false;
  }
}
