import type { SupabaseClient } from "@supabase/supabase-js";

export function readOwnedAsset(client: SupabaseClient, ownerId: string, assetId: string, signal: AbortSignal) {
  return client.from("assets")
    .select("id, object_name, tier, glb_url, triangle_count, scale_meters, brief_json")
    .eq("id", assetId)
    .eq("owner_id", ownerId)
    .abortSignal(signal)
    .maybeSingle();
}
