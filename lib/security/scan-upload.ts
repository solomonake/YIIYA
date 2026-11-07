import { readBoundedResponse } from "@/lib/bounded-response";
import { supabaseRestFetch, isSupabaseRestConfigured } from "@/lib/supabase-rest";

import { MAX_SCAN_FILE_BYTES, MAX_SCAN_BODY_BYTES } from "@/lib/scan-upload-limits";
export { MAX_SCAN_FILE_BYTES, MAX_SCAN_BODY_BYTES } from "@/lib/scan-upload-limits";
export class ScanUploadError extends Error {
  constructor(public readonly status: 400 | 413 | 415 | 429 | 503, message: string) { super(message); }
}

export async function readScanUpload(request: Request, kind: "image" | "video") {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new ScanUploadError(415, "Expected a multipart file upload.");
  }
  let form: FormData;
  try {
    const bytes = await readBoundedResponse(new Response(request.body, { headers: request.headers }), MAX_SCAN_BODY_BYTES);
    form = await new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch (error) {
    if (error instanceof Error && error.message === "Artifact exceeds byte limit") {
      throw new ScanUploadError(413, "Upload is too large. Use a file under 3 MiB.");
    }
    throw new ScanUploadError(400, "Invalid multipart upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || form.getAll("file").length !== 1 || file.size < 1) {
    throw new ScanUploadError(400, "Expected exactly one nonempty file.");
  }
  if (file.size > MAX_SCAN_FILE_BYTES) throw new ScanUploadError(413, "Use a file under 3 MiB.");
  const type = file.type.toLowerCase().split(";")[0].trim();
  const header = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const matches = kind === "image"
    ? (type === "image/png" && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (type === "image/jpeg" && header[0] === 255 && header[1] === 216 && header[2] === 255) ||
      (type === "image/webp" && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP")
    : (type === "video/webm" && header.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) ||
      (type === "video/mp4" && header.toString("ascii", 4, 8) === "ftyp");
  if (!matches) throw new ScanUploadError(415, kind === "image"
    ? "Use a PNG, JPEG or WebP image with matching content."
    : "Use a WebM or MP4 video with matching content.");
  return { form, file };
}

/** Requires the service-only RPC migration. No in-memory fallback, even in dev. */
export async function reserveScanUpload(scanId: string, bytes: number): Promise<void> {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_SCAN_FILE_BYTES) {
    throw new ScanUploadError(413, "Invalid upload size.");
  }
  if (!isSupabaseRestConfigured("service")) throw new ScanUploadError(503, "Shared upload limits are unavailable.");
  try {
    const response = await supabaseRestFetch("rpc/reserve_scan_upload", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_scan_id: scanId, p_bytes: bytes })
    }, "service");
    if (!response.ok) throw new Error("Upload reservation unavailable");
    const admitted: unknown = await response.json();
    if (admitted === false) throw new ScanUploadError(429, "This scan is closed or its upload allowance is exhausted. Start a new scan.");
    if (admitted !== true) throw new Error("Invalid reservation response");
  } catch (error) {
    if (error instanceof ScanUploadError) throw error;
    throw new ScanUploadError(503, "Shared upload limits are unavailable. Try again later.");
  }
}

export function scanUploadFailure(error: unknown) {
  return Response.json({ error: error instanceof ScanUploadError ? error.message : "Upload validation failed." },
    { status: error instanceof ScanUploadError ? error.status : 400 });
}
