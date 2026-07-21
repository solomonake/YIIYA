export function isVercelBlobConfigured() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  return Boolean(
    token &&
      !token.includes("your_") &&
      !token.includes("YOUR_") &&
      token.trim().length > 8
  );
}

/**
 * Upload raw image bytes to Vercel Blob and return a durable public https URL.
 * Accepts either raw base64 or a `data:<mime>;base64,...` data URL. Returns null
 * when Blob isn't configured or the upload fails, so callers can degrade rather
 * than throw. Used by the phone-companion capture route to host orbit views —
 * the KV then stores only these URLs, never the bytes.
 */
export async function uploadImageToBlob(
  base64: string,
  mime = "image/png",
  prefix = "capture"
): Promise<string | null> {
  if (!isVercelBlobConfigured()) return null;
  try {
    const payload = base64.startsWith("data:")
      ? base64.slice(base64.indexOf(",") + 1)
      : base64;
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const name = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { put } = await import("@vercel/blob");
    const blob = await put(name, Buffer.from(payload, "base64"), {
      access: "public",
      contentType: mime,
      addRandomSuffix: false
    });
    return blob.url;
  } catch {
    return null;
  }
}

/**
 * Download a GLB from a provider URL (typically an ephemeral HuggingFace
 * Space temp file) and re-host it on Vercel Blob so the URL persists past
 * the Space's tmpfs lifetime. Returns the durable URL, or the original on
 * any failure (so the caller can still try to serve the ephemeral URL).
 */
export async function mirrorGlbToBlob(
  sourceUrl: string,
  filename: string
): Promise<{ url: string; mirrored: boolean; sizeBytes: number; error?: string }> {
  if (!isVercelBlobConfigured()) {
    return { url: sourceUrl, mirrored: false, sizeBytes: 0, error: "BLOB_READ_WRITE_TOKEN not set" };
  }
  if (sourceUrl.startsWith("/api/") || sourceUrl.startsWith("data:")) {
    return { url: sourceUrl, mirrored: false, sizeBytes: 0 };
  }

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) {
      return { url: sourceUrl, mirrored: false, sizeBytes: 0, error: `Source HTTP ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const { put } = await import("@vercel/blob");
    const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    const stamped = `glb/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}.glb`;
    const blob = await put(stamped, buf, {
      access: "public",
      contentType: "model/gltf-binary",
      addRandomSuffix: false
    });

    return { url: blob.url, mirrored: true, sizeBytes: buf.byteLength };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { url: sourceUrl, mirrored: false, sizeBytes: 0, error: msg.slice(0, 160) };
  }
}
