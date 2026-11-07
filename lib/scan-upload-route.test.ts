import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/security/scan-access", () => ({ authorizeScanAccess: vi.fn() }));
vi.mock("@/lib/scan-job-store", () => ({ getScanJob: vi.fn(), attachScanUpload: vi.fn() }));
vi.mock("@/lib/asset-jobs", () => ({ syncAssetJobFromScan: vi.fn() }));
vi.mock("@/lib/vercel-blob", () => ({ isVercelBlobConfigured: () => true }));
vi.mock("@/lib/supabase-rest", () => ({ isSupabaseRestConfigured: () => true, supabaseRestFetch: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
import { authorizeScanAccess } from "@/lib/security/scan-access";
import { getScanJob, attachScanUpload } from "@/lib/scan-job-store";
import { supabaseRestFetch } from "@/lib/supabase-rest";
import { put } from "@vercel/blob";
import { POST as frame } from "@/app/api/scan/jobs/[id]/upload/frame/route";
import { POST as video } from "@/app/api/scan/jobs/[id]/upload/video/route";
const routes = [
  { name: "frame", post: frame, bytes: new Uint8Array([255, 216, 255, 224]), type: "image/jpeg" },
  { name: "video", post: video, bytes: new Uint8Array([26, 69, 223, 163]), type: "video/webm" }
];
function request(bytes: Uint8Array, type: string) {
  const form = new FormData(); form.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), "fixture");
  return new Request("https://yiiya.test", { method: "POST", body: form });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(authorizeScanAccess).mockResolvedValue(null);
  vi.mocked(getScanJob).mockResolvedValue({ id: "job-a" } as Awaited<ReturnType<typeof getScanJob>>);
});
it.each(routes)("$name denies exhausted quota before storage or attachment", async route => {
  vi.mocked(supabaseRestFetch).mockResolvedValue(Response.json(false));
  const response = await route.post(request(route.bytes, route.type), { params: { id: "job-a" } });
  expect(response.status).toBe(429);
  expect(put).not.toHaveBeenCalled(); expect(attachScanUpload).not.toHaveBeenCalled();
});
it.each(routes)("$name denies invalid content before reserving or storing", async route => {
  const response = await route.post(request(new Uint8Array([1, 2, 3]), route.type), { params: { id: "job-a" } });
  expect(response.status).toBe(415);
  expect(supabaseRestFetch).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
});
it("retains reservation after uncertain storage failure, with no refund call", async () => {
  vi.mocked(supabaseRestFetch).mockResolvedValue(Response.json(true));
  vi.mocked(put).mockRejectedValue(new Error("timeout after possible write"));
  await expect(frame(request(routes[0].bytes, routes[0].type), { params: { id: "job-a" } })).rejects.toThrow("timeout");
  expect(supabaseRestFetch).toHaveBeenCalledTimes(1);
  expect(put).toHaveBeenCalledTimes(1);
  expect(attachScanUpload).not.toHaveBeenCalled();
});
