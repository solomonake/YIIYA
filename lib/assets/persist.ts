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
