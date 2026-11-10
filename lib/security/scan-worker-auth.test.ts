import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/scan-job-store", () => ({
  applyFalWebhook: vi.fn(), applyReconstructionWebhook: vi.fn(),
  getScanJob: vi.fn(), registerWorkerArtifact: vi.fn()
}));
vi.mock("@/lib/asset-jobs", () => ({ syncAssetJobFromScan: vi.fn() }));
vi.mock("@/lib/vercel-blob", () => ({ isVercelBlobConfigured: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
import { applyFalWebhook, applyReconstructionWebhook, getScanJob, registerWorkerArtifact } from "@/lib/scan-job-store";
import { syncAssetJobFromScan } from "@/lib/asset-jobs";
import { put } from "@vercel/blob";
import { POST as falPost } from "@/app/api/scan/webhooks/fal/route";
import { POST as reconstructionPost } from "@/app/api/scan/webhooks/reconstruction/route";
import { POST as artifactPost } from "@/app/api/scan/jobs/[id]/worker-artifact/route";
const endpoints = [
  { name: "fal", post: (r: Request) => falPost(r), secret: "SCAN_FAL_WEBHOOK_SECRET", header: "x-yiiya-webhook-secret" },
  { name: "reconstruction", post: (r: Request) => reconstructionPost(r), secret: "SCAN_RECONSTRUCTION_WEBHOOK_SECRET", header: "x-yiiya-webhook-secret" },
  { name: "artifact", post: (r: Request) => artifactPost(r, { params: { id: "scan-test" } }), secret: "SCAN_RECONSTRUCTION_WEBHOOK_SECRET", header: "x-yiiya-worker-secret" }
];
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe.each(endpoints)("$name worker admission", endpoint => {
  it.each([undefined, "", "   "])("rejects absent/blank configuration %# before body or side effects", async secret => {
    vi.stubEnv(endpoint.secret, secret);
    const request = new Request("https://yiiya.test", { method: "POST", body: "unparseable" });
    const response = await endpoint.post(request);
    expect(response.status).toBe(503);
    expect(request.bodyUsed).toBe(false);
    expect(applyFalWebhook).not.toHaveBeenCalled();
    expect(applyReconstructionWebhook).not.toHaveBeenCalled();
    expect(getScanJob).not.toHaveBeenCalled();
    expect(registerWorkerArtifact).not.toHaveBeenCalled();
    expect(syncAssetJobFromScan).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it.each(["", "wrong", "x".repeat(4097)])("rejects missing, incorrect or oversized credentials %#", async provided => {
    vi.stubEnv(endpoint.secret, "test-worker-secret");
    const request = new Request("https://yiiya.test", { method: "POST", body: "unparseable", headers: { [endpoint.header]: provided } });
    const response = await endpoint.post(request);
    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(applyFalWebhook).not.toHaveBeenCalled();
    expect(applyReconstructionWebhook).not.toHaveBeenCalled();
    expect(getScanJob).not.toHaveBeenCalled();
    expect(registerWorkerArtifact).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it("lets correctly authenticated requests reach the existing input/job checks", async () => {
    vi.stubEnv(endpoint.secret, "test-worker-secret");
    vi.mocked(getScanJob).mockResolvedValue(null);
    const request = new Request("https://yiiya.test", { method: "POST", body: "{}", headers: { [endpoint.header]: "test-worker-secret" } });
    const response = await endpoint.post(request);
    expect(response.status).toBe(endpoint.name === "artifact" ? 404 : 400);
    expect(put).not.toHaveBeenCalled();
  });
});
