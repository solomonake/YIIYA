"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-client";

// Module-level so re-renders/remounts of the canvas don't re-upload the same
// poster twice in one session — a harmless but wasteful duplicate otherwise.
const captured = new Set<string>();

export function hasCaptured(assetDbId: string): boolean {
  return captured.has(assetDbId);
}

/**
 * Uploads a canvas snapshot as the poster thumbnail for a saved asset.
 * Silent no-op on any failure (missing auth, Blob not configured, network) —
 * a missing poster is a cosmetic gap, never worth surfacing as an error.
 */
export async function capturePoster(assetDbId: string, dataUrl: string): Promise<void> {
  if (captured.has(assetDbId)) return;
  captured.add(assetDbId);

  const client = getSupabaseBrowserClient();
  const accessToken = client ? (await client.auth.getSession()).data.session?.access_token : null;
  if (!accessToken) return;

  try {
    await fetch("/api/assets/poster", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ assetId: assetDbId, dataUrl })
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
