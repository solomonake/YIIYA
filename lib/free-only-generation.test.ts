import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@gradio/client", () => ({ Client: { connect: vi.fn() } }));
vi.mock("@/lib/scene/glb-inspect", () => ({ inspectGlbUrl: vi.fn() }));
vi.mock("@/lib/vercel-blob", () => ({ mirrorGlbToBlob: vi.fn() }));
vi.mock("@/lib/supabase-rest", () => ({
  isSupabaseRestConfigured: () => false,
  supabaseRestFetch: vi.fn()
}));

import { Client } from "@gradio/client";
import { inspectGlbUrl } from "./scene/glb-inspect";
import { mirrorGlbToBlob } from "./vercel-blob";
import { attachScanUpload, completeScanUpload, createScanJob, getScanInfraStatus } from "./scan-job-store";

describe("free-only runtime boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("YIIYA_3D_MODE", "free-only");
    vi.stubEnv("YIIYA_PROVIDER_ORDER", "");
    vi.stubEnv("YIIYA_FREE_FIRST", "1");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("HUGGINGFACE_TOKEN", "");
    for (const key of ["FAL_KEY", "TRIPO_API_KEY", "MESHY_API_KEY"]) vi.stubEnv(key, "test-unused-key");
    vi.stubEnv("FAL_ENABLE_RODIN", "1");
    vi.stubEnv("SCAN_RECONSTRUCTION_ENDPOINT", "https://worker.example/reconstruct");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    vi.mocked(Client.connect).mockReset().mockRejectedValue(new Error("GPU quota exhausted for Bearer hf_privateSecret"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports missing HF setup before spending on interpretation or commercial generation", async () => {
    const { runInterpretPipeline } = await import("./interpret-pipeline");
    vi.mocked(fetch).mockClear();
    const events = [];
    for await (const event of runInterpretPipeline({ transcript: "a lamp" })) events.push(event);
    expect(events).toEqual([{ type: "error", message: expect.stringContaining("Hugging Face token") }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(Client.connect).not.toHaveBeenCalled();
  });

  it("rejects a paid-only override instead of using configured paid keys", async () => {
    vi.stubEnv("HUGGINGFACE_TOKEN", "hf_test");
    vi.stubEnv("YIIYA_PROVIDER_ORDER", "meshy,fal-rodin,tripo");
    const { runInterpretPipeline } = await import("./interpret-pipeline");
    vi.mocked(fetch).mockClear();
    const events = [];
    for await (const event of runInterpretPipeline({ transcript: "a lamp" })) events.push(event);
    expect(events).toEqual([{ type: "error", message: expect.stringContaining("no allowed Hugging Face providers") }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses a personal HF token, never calls paid providers after HF failure, and discloses unused orbit views", async () => {
    const { runInterpretPipeline } = await import("./interpret-pipeline");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const events = [];
    const photo = { base64: "aW1hZ2U=", mediaType: "image/png", name: "face.png" };
    for await (const event of runInterpretPipeline({
      transcript: "a human face bust", userHfToken: "hf_personal",
      referenceImage: { ...photo, additionalViews: [photo, photo] }
    })) events.push(event);
    expect(Client.connect).toHaveBeenCalledWith("microsoft/TRELLIS.2", { hf_token: "hf_personal" });
    expect(JSON.stringify(events)).not.toContain("hf_privateSecret");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("hf_privateSecret");
    expect(vi.mocked(Client.connect).mock.calls.length).toBeGreaterThan(1);
    for (const [url] of vi.mocked(fetch).mock.calls) {
      expect(new URL(String(url)).hostname.endsWith(".hf.space")).toBe(true);
    }
    expect(events.some(event => event.type === "generating" && event.log.includes("first photo"))).toBe(true);
    const result = events.find(event => event.type === "asset_ready");
    expect(result).toMatchObject({ asset: { tier: "fallback", exportUrls: {} } });
    expect(events.find(event => event.type === "qa")).toMatchObject({
      qa_log: expect.arrayContaining(["[QA] 0 usable asset(s) generated; 1 failed."])
    });
  });

  it("retains scan uploads without submitting to a configured external worker or fal", async () => {
    const { scanId } = await createScanJob("https://yiiya.example", "a lamp");
    await attachScanUpload(scanId, {
      kind: "keyframe", fileName: "lamp.png", url: "https://storage.example/lamp.png",
      mimeType: "image/png", sizeBytes: 100, sourceDevice: "mobile"
    });
    const result = await completeScanUpload(scanId);
    expect(result?.state).toBe("failed");
    expect(result?.uploads).toHaveLength(1);
    expect(result?.warnings).toContainEqual(expect.objectContaining({ code: "free-only-reconstruction" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(getScanInfraStatus()).toMatchObject({ modalConfigured: false, falConfigured: false });
  });

  it("still delivers a validated HF mesh and stops before fallback providers", async () => {
    vi.stubEnv("HUGGINGFACE_TOKEN", "hf_server");
    const source = "https://microsoft-trellis-2.hf.space/output.glb";
    const hosted = "https://storage.example/lamp.glb";
    const submit = vi.fn().mockImplementation((endpoint: string) => ({
      cancel: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield { type: "data", data: [endpoint === "/extract_glb" ? source : "preprocessed-image"] };
        yield { type: "status", stage: "complete" };
      }
    }));
    vi.mocked(Client.connect).mockResolvedValue({ submit } as never);
    vi.mocked(inspectGlbUrl).mockResolvedValue({ ok: true, reason: null, geometry: null, sizeBytes: 100000 });
    vi.mocked(mirrorGlbToBlob).mockResolvedValue({ url: hosted, mirrored: true, sizeBytes: 100000 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runInterpretOnce } = await import("./interpret-pipeline");
    const result = await runInterpretOnce({
      transcript: "a desk lamp",
      referenceImage: { base64: "aW1hZ2U=", mediaType: "image/png", name: "lamp.png" }
    });
    expect(Client.connect).toHaveBeenCalledTimes(1);
    expect(result.assets[0]).toMatchObject({ glbUrl: hosted, tier: "trellis", exportUrls: { glb: hosted } });
  });
  it("delivers SF3D only after preparation, removal and real generation", async () => {
    vi.stubEnv("HUGGINGFACE_TOKEN", "hf_test");
    vi.stubEnv("YIIYA_PROVIDER_ORDER", "hf-stablefast");
    const source="https://stabilityai-stable-fast-3d.hf.space/output.glb";
    const hosted="https://storage.example/sf3d.glb";
    const submit=vi.fn().mockImplementation((endpoint:string,payload:unknown)=>({
      cancel:vi.fn(),
      async *[Symbol.asyncIterator]() {
        const run=Array.isArray(payload)?payload[0]:null;
        yield {type:"data",data:endpoint==="/requires_bg_remove"?[{value:"Remove Background"},null,null]:
          run==="Remove Background"?[{value:"Run"},"preview.png",null]:[{},"preview.png",{value:{url:source}}]};
        yield {type:"status",stage:"complete"};
      }
    }));
    vi.mocked(Client.connect).mockResolvedValue({submit} as never);
    vi.mocked(inspectGlbUrl).mockResolvedValue({ok:true,reason:null,geometry:null,sizeBytes:100000});
    vi.mocked(mirrorGlbToBlob).mockResolvedValue({url:hosted,mirrored:true,sizeBytes:100000});
    const {runInterpretOnce}=await import("./interpret-pipeline");
    const result=await runInterpretOnce({transcript:"a dinosaur",referenceImage:{base64:"aW1hZ2U=",mediaType:"image/png",name:"dino.png"}});
    expect(Client.connect).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls.map(c=>c[0])).toEqual(["/requires_bg_remove","/run_button","/run_button"]);
    expect(submit.mock.calls[2][1][0]).toBe("Run");
    expect(result.assets[0]).toMatchObject({glbUrl:hosted,exportUrls:{glb:hosted}});
  });
  it("stops the cascade and cancels a stalled HF stage on deadline", async () => {
    vi.stubEnv("HUGGINGFACE_TOKEN", "hf_test");
    const { runInterpretPipeline } = await import("./interpret-pipeline");
    vi.useFakeTimers();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const submit = vi.fn(() => ({ cancel, async *[Symbol.asyncIterator]() {
      await new Promise(() => {});
    } }));
    vi.mocked(Client.connect).mockResolvedValue({ submit } as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const events: unknown[] = [];
      const pending = (async () => { for await (const event of runInterpretPipeline({ transcript: "a lamp", referenceImage: {
        base64: "aW1hZ2U=", mediaType: "image/png", name: "lamp.png"
      } })) events.push(event); })();
      await vi.advanceTimersByTimeAsync(120_001);
      await pending;
      expect(Client.connect).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(events).toContainEqual(expect.objectContaining({ type: "asset_ready", asset: expect.objectContaining({ tier: "fallback" }) }));
      expect(JSON.stringify(events)).toContain("remote completion is unknown");
    } finally { vi.useRealTimers(); }
  });

});
