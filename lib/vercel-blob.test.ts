import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
import { readFileSync } from "node:fs";
const model = readFileSync(process.env.YIIYA_TEST_GLB_PATH || "public/models/dinoring-reconstructed.glb");
import { put } from "@vercel/blob";
import { mirrorGlbToBlob } from "./vercel-blob";

describe("authenticated artifact mirroring", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test_blob_token");
    vi.stubEnv("HUGGINGFACE_TOKEN", "hf_server");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(model))));
    vi.mocked(put).mockResolvedValue({ url: "https://store.public.blob.vercel-storage.com/result.glb" } as never);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("uses the job's personal token to retrieve an HF output, without persisting it", async () => {
    const result = await mirrorGlbToBlob("https://microsoft-trellis-2.hf.space/result.glb", "lamp", "hf_personal");
    expect(result.mirrored).toBe(true);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: { Authorization: "Bearer hf_personal" }, redirect: "error"
    }));
    expect(JSON.stringify(vi.mocked(put).mock.calls)).not.toContain("hf_personal");
  });
  it("does not leak an HF token to another provider", async () => {
    await mirrorGlbToBlob("https://v3.fal.media/result.glb", "lamp", "hf_personal");
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: {} }));
  });
  it("rejects untrusted provider output before fetching", async () => {
    expect((await mirrorGlbToBlob("https://attacker.example/file", "lamp")).mirrored).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it.each([
    ["html", Buffer.from("<html>Expired output</html>")],
    ["truncated", model.subarray(0, model.length - 1)]
  ])("rejects a %s response before uploading a durable file", async (_reason, bytes) => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array(bytes as Buffer)));
    const result = await mirrorGlbToBlob("https://microsoft-trellis-2.hf.space/result.glb", "lamp", "hf_personal");
    expect(result.mirrored).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });
  it("reports failed retrieval without claiming a durable artifact", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("forbidden", { status: 403 }));
    expect(await mirrorGlbToBlob("https://microsoft-trellis-2.hf.space/result.glb", "lamp"))
      .toMatchObject({ mirrored: false, error: "Source HTTP 403" });
    expect(put).not.toHaveBeenCalled();
  });
});
