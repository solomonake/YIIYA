import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-rest", () => ({ isSupabaseRestConfigured: vi.fn(), supabaseRestFetch: vi.fn() }));
import { isSupabaseRestConfigured, supabaseRestFetch } from "@/lib/supabase-rest";
import { MAX_SCAN_BODY_BYTES, MAX_SCAN_FILE_BYTES, readScanUpload, reserveScanUpload } from "./scan-upload";
const jpeg = new Uint8Array([255, 216, 255, 224]);
function upload(bytes: Uint8Array, type = "image/jpeg") {
  const form = new FormData(); form.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), "photo.jpg");
  return new Request("https://yiiya.test", { method: "POST", body: form });
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(isSupabaseRestConfigured).mockReturnValue(true); });
afterEach(() => vi.unstubAllGlobals());
it("accepts a matching frame signature", async () => {
  expect((await readScanUpload(upload(jpeg), "image")).file.size).toBe(4);
});
it("rejects mismatched type before any reservation", async () => {
  await expect(readScanUpload(upload(jpeg, "image/png"), "image")).rejects.toMatchObject({ status: 415 });
  expect(supabaseRestFetch).not.toHaveBeenCalled();
});
it("rejects oversized file inside a bounded multipart envelope", async () => {
  await expect(readScanUpload(upload(new Uint8Array(MAX_SCAN_FILE_BYTES + 1)), "image")).rejects.toMatchObject({ status: 413 });
});
it("cancels chunked oversized bodies even without content length", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_SCAN_BODY_BYTES + 1)); }, cancel() { cancelled = true; } });
  const request = new Request("https://yiiya.test", { method: "POST", body: stream,
    headers: { "Content-Type": "multipart/form-data; boundary=test" }, duplex: "half" } as RequestInit);
  await expect(readScanUpload(request, "image")).rejects.toMatchObject({ status: 413 });
  expect(cancelled).toBe(true);
});
it("rejects multiple files in one allowance", async () => {
  const form = new FormData();
  form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "a.jpg");
  form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "b.jpg");
  await expect(readScanUpload(new Request("https://yiiya.test", { method: "POST", body: form }), "image")).rejects.toMatchObject({ status: 400 });
});
it.each([false, null, {}, "true"])("only accepts an explicit successful shared reservation: %s", async result => {
  vi.mocked(supabaseRestFetch).mockResolvedValue(Response.json(result));
  await expect(reserveScanUpload("scan-id", 4)).rejects.toMatchObject({ status: result === false ? 429 : 503 });
});
it("reserves actual bytes through the service-only RPC", async () => {
  vi.mocked(supabaseRestFetch).mockResolvedValue(Response.json(true));
  await reserveScanUpload("scan-id", 4);
  expect(supabaseRestFetch).toHaveBeenCalledWith("rpc/reserve_scan_upload", expect.objectContaining({ body: JSON.stringify({ p_scan_id: "scan-id", p_bytes: 4 }) }), "service");
});
it("fails closed when migration/storage is unavailable", async () => {
  vi.mocked(supabaseRestFetch).mockResolvedValue(new Response("missing RPC", { status: 404 }));
  await expect(reserveScanUpload("scan-id", 4)).rejects.toMatchObject({ status: 503 });
  vi.mocked(isSupabaseRestConfigured).mockReturnValue(false);
  await expect(reserveScanUpload("scan-id", 4)).rejects.toMatchObject({ status: 503 });
});
