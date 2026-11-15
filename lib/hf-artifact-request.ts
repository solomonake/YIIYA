import { normalizeHfToken } from "./huggingface-access";
import { isAuthenticatedHfUrl } from "./provider-hosts";
import { resolveArtifactUpstream } from "./scene/viewer-source";

export const HF_ARTIFACT_HEADER = "x-yiiya-hf-token";

/** Only our exact proxy and converter receive a visitor credential. Never
 * attach it to a renderer, redirect, external URL or glTF subresource. */
export function personalArtifactRequest(path: string, token: string): RequestInit | undefined {
  if (!path.startsWith("/api/3d/proxy?") && !path.startsWith("/api/3d/convert?")) return;
  const url = new URL(path, "https://studio.invalid");
  const source = url.pathname === "/api/3d/proxy"
    ? url.searchParams.get("src")
    : resolveArtifactUpstream(url.searchParams.get("from") ?? "");
  const key = normalizeHfToken(token);
  if (!key || !source || !isAuthenticatedHfUrl(source)) return;
  return { headers: { [HF_ARTIFACT_HEADER]: key }, mode: "same-origin", redirect: "error", cache: "no-store" };
}
