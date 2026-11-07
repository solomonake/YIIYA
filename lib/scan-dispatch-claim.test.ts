import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-rest", () => ({ isSupabaseRestConfigured: () => false, supabaseRestFetch: vi.fn() }));
import { applyReconstructionWebhook, cancelScanJob, completeScanUpload, createScanJob, getScanAccess, getScanJob, updateScanCapture } from "./scan-job-store";

beforeEach(() => {
  vi.stubEnv("YIIYA_3D_MODE", "mixed");
  vi.stubEnv("SCAN_RECONSTRUCTION_ENDPOINT", "https://worker.test/reconstruct");
  vi.stubEnv("FAL_KEY", "");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("local scan dispatch claim", () => {
  it("preserves server access metadata across completion without exposing it in summaries", async () => {
    const access = { ownerId: "owner-a", tokenHash: "a".repeat(64), expiresAt: Date.now() + 100000 };
    const result = await createScanJob("https://yiiya.test", "mug", access);
    await completeScanUpload(result.scanId);
    expect(await getScanAccess(result.scanId)).toEqual(access);
    expect(JSON.stringify(await getScanJob(result.scanId, false))).not.toContain(access.tokenHash);
  });
  it("dispatches once across simultaneous completions and sequential replay", async () => {
    const { scanId } = await createScanJob("https://yiiya.test", "mug");
    await Promise.all(Array.from({ length: 8 }, () => completeScanUpload(scanId)));
    await updateScanCapture(scanId, { captureStatus: "capturing" });
    await completeScanUpload(scanId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await getScanJob(scanId, false)).toMatchObject({ state: "ingesting", stage: "ingest" });
  });
  it("does not reset or dispatch a cancelled job", async () => {
    const { scanId } = await createScanJob("https://yiiya.test", "mug");
    await cancelScanJob(scanId);
    expect(await completeScanUpload(scanId)).toMatchObject({ state: "cancelled" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("late capture packets cannot rearm a provider-queued job", async () => {
    const { scanId } = await createScanJob("https://yiiya.test", "mug");
    await completeScanUpload(scanId);
    await applyReconstructionWebhook({ scanId, state: "queued", stage: "ingest" });
    await updateScanCapture(scanId, { captureStatus: "capturing" });
    await completeScanUpload(scanId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await getScanJob(scanId, false)).toMatchObject({ stage: "ingest" });
  });
  it("retains the claim after an uncertain worker timeout; replay cannot rebill", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("timeout after possible acceptance"));
    const { scanId } = await createScanJob("https://yiiya.test", "mug");
    await expect(completeScanUpload(scanId)).rejects.toThrow("timeout");
    await completeScanUpload(scanId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await getScanJob(scanId, false)).toMatchObject({ state: "ingesting" });
  });
  it("does not dispatch missing jobs", async () => {
    expect(await completeScanUpload("missing-job")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
