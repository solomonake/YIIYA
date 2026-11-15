/** Storage provenance, not an uptime guarantee. A proxy does not persist bytes. */
export function assetStorageStatus(raw: string): "mirrored" | "temporary" | "unknown" {
  if (raw.startsWith("/api/3d/proxy?")) return "temporary";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return "unknown";
    if (url.pathname === "/api/3d/proxy") return "temporary";
    if (url.hostname.endsWith(".public.blob.vercel-storage.com")) return "mirrored";
    if (url.hostname.endsWith(".hf.space")) return "temporary";
  } catch { /* Relative/static or malformed URLs have unverified persistence. */ }
  return "unknown";
}
