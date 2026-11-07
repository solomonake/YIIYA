import { isAllowedProviderUrl } from "@/lib/provider-hosts";

/** Return the approved upstream even when the studio supplied its own proxy link. */
export function resolveArtifactUpstream(raw: string): string {
  if (isAllowedProviderUrl(raw)) return raw;
  if (!raw.startsWith("/api/3d/proxy?")) return "";
  try {
    const url = new URL(raw, "https://viewer.invalid");
    const source = url.searchParams.get("src");
    if (url.pathname !== "/api/3d/proxy" || !source || !isAllowedProviderUrl(source)) return "";
    return source;
  } catch { return ""; }
}

/** Browser shares retain the same-origin proxy for authenticated upstream fetches. */
export function resolveViewerSource(raw: string): string {
  const upstream = resolveArtifactUpstream(raw);
  return upstream && raw.startsWith("/api/3d/proxy?")
    ? `/api/3d/proxy?src=${encodeURIComponent(upstream)}` : upstream;
}
