import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/security/scan-access", () => ({ authorizeScanAccess: vi.fn() }));
vi.mock("@/lib/scan-job-store", () => ({ getScanJob: vi.fn(), updateScanCapture: vi.fn(), cancelScanJob: vi.fn(), completeScanUpload: vi.fn(), attachScanUpload: vi.fn() }));
vi.mock("@/lib/asset-jobs", () => ({ syncAssetJobFromScan: vi.fn() }));
vi.mock("@/lib/vercel-blob", () => ({ isVercelBlobConfigured: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
import { authorizeScanAccess } from "@/lib/security/scan-access";
import * as store from "@/lib/scan-job-store";
import { put } from "@vercel/blob";
import { GET } from "@/app/api/scan/jobs/[id]/route";
import { POST as capture } from "@/app/api/scan/jobs/[id]/capture/route";
import { POST as cancel } from "@/app/api/scan/jobs/[id]/cancel/route";
import { POST as complete } from "@/app/api/scan/jobs/[id]/complete-upload/route";
import { POST as frame } from "@/app/api/scan/jobs/[id]/upload/frame/route";
import { POST as video } from "@/app/api/scan/jobs/[id]/upload/video/route";
beforeEach(() => vi.resetAllMocks());
it.each([["read", GET], ["capture", capture], ["cancel", cancel], ["complete", complete], ["frame", frame], ["video", video]] as const)(
  "%s rejects unauthorized access before body read or side effects", async (_name, handler) => {
    vi.mocked(authorizeScanAccess).mockResolvedValue(new Response("denied", { status: 403 }));
    const request = new Request("https://yiiya.test", { method: "POST", body: "unparseable" });
    expect((await handler(request, { params: { id: "someone-elses-job" } })).status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
