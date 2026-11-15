import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/scan-job-store", () => ({ createScanJob: vi.fn() }));
vi.mock("@/lib/asset-jobs", () => ({ syncAssetJobFromScan: vi.fn() }));
vi.mock("@/lib/security/generation-identity", () => ({ resolveGenerationIdentity: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ checkLimit: vi.fn(), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/supabase-rest", () => ({ isSupabaseRestConfigured: () => true }));
import { createScanJob } from "@/lib/scan-job-store";
import { resolveGenerationIdentity } from "@/lib/security/generation-identity";
import { checkLimit } from "@/lib/security/rate-limit";
import { hashScanToken } from "@/lib/security/scan-capability";
import { POST } from "@/app/api/scan/jobs/route";
const request = () => new NextRequest("https://yiiya.test/api/scan/jobs", { method: "POST", body: JSON.stringify({ promptHint: "mug", userId: "forged-owner" }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveGenerationIdentity).mockResolvedValue({ userId: "verified-owner", identityKey: "user:verified-owner", isExempt: false });
  vi.mocked(checkLimit).mockResolvedValue({ success: true, unavailable: false, remaining: 1, limit: 2, reset: 1 });
  vi.mocked(createScanJob).mockResolvedValue({ scanId: "job-a", mobileUrl: "https://yiiya.test/scan/job-a", job: {} } as Awaited<ReturnType<typeof createScanJob>>);
});
it("uses verified owner, stores only hash and returns token once in a no-store response", async () => {
  const response = await POST(request());
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(body.mobileUrl).toBe(`https://yiiya.test/scan/job-a#scanToken=${body.accessToken}`);
  expect(createScanJob).toHaveBeenCalledWith("https://yiiya.test", "mug", { ownerId: "verified-owner", tokenHash: hashScanToken(body.accessToken), expiresAt: body.accessExpiresAt });
  expect(JSON.stringify(vi.mocked(createScanJob).mock.calls)).not.toContain(body.accessToken);
});
it("does not create records when shared admission is unavailable", async () => {
  vi.mocked(checkLimit).mockResolvedValue({ success: false, unavailable: true, remaining: 0, limit: 2, reset: 1 });
  expect((await POST(request())).status).toBe(503);
  expect(createScanJob).not.toHaveBeenCalled();
});
