/**
 * Allowlist of hosts our server is willing to fetch 3D artifacts and
 * reference images from. Used by the GLB proxy and the export converter to
 * prevent SSRF: user-influenced URLs must resolve to a known provider host
 * before the server will fetch them.
 */

const ALLOWED_HOST_SUFFIXES = [
  ".hf.space", // HuggingFace Space gradio temp files
  ".fal.media", // fal.ai output CDN
  ".fal.run",
  ".tripo3d.ai", // Tripo API + CDN
  ".tripo3d.com",
  ".meshy.ai", // Meshy output CDN
  ".pollinations.ai", // studio reference photos
  ".public.blob.vercel-storage.com", // our own mirrored artifacts
  ".blob.vercel-storage.com"
];

const ALLOWED_EXACT_HOSTS = new Set([
  "image.pollinations.ai",
  "huggingface.co"
]);

// Fetch permission is not permission to receive a user's private HF credential.
// These are the five Space endpoints actually used by the generator.
const AUTHENTICATED_HF_HOSTS = new Set([
  "tencent-hunyuan3d-2.hf.space",
  "trellis-community-trellis.hf.space",
  "microsoft-trellis-2.hf.space",
  "tencentarc-instantmesh.hf.space",
  "stabilityai-stable-fast-3d.hf.space"
]);

export function isAllowedProviderUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length
  );
}

/**
 * HuggingFace Space file endpoints often require the same token the gradio
 * client used to start the job — an anonymous browser GET returns 403.
 * Attach the server's HF token whenever we proxy a Space URL.
 */
export function providerAuthHeaders(raw: string, userHfToken?: string): Record<string, string> {
  try {
    if (!isAllowedProviderUrl(raw)) return {};
    const host = new URL(raw).hostname.toLowerCase();
    const token = userHfToken?.trim() || process.env.HUGGINGFACE_TOKEN;
    if (token && !token.includes("your_") && AUTHENTICATED_HF_HOSTS.has(host)) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // fall through
  }
  return {};
}
