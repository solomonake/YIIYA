import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/security/rate-limit", () => ({ checkLimit: vi.fn() }));
vi.mock("@/lib/security/generation-identity", () => ({ resolveGenerationIdentity: vi.fn() }));
vi.mock("@/lib/huggingface-access", async importOriginal => ({
  ...await importOriginal<typeof import("./huggingface-access")>(), verifyHfToken: vi.fn()
}));
import { checkLimit } from "./security/rate-limit";
import { resolveGenerationIdentity } from "./security/generation-identity";
import { verifyHfToken } from "./huggingface-access";
import { POST } from "@/app/api/huggingface/check/route";
const request = (body: string, headers = {}) => new NextRequest("https://yiiya.test/api/huggingface/check", { method: "POST", body, headers });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveGenerationIdentity).mockResolvedValue({ identityKey: "ip:test", userId: null, isExempt: true });
  vi.mocked(checkLimit).mockResolvedValue({ success: true, remaining: 1, limit: 10, reset: 0, unavailable: false });
  vi.mocked(verifyHfToken).mockResolvedValue("accepted");
});
it.each([false, true])("denies checks before upstream access when limiter unavailable=%s", async unavailable => {
  vi.mocked(checkLimit).mockResolvedValue({ success: false, remaining: 0, limit: 10, reset: 0, unavailable });
  const response = await POST(request('{"token":"hf_testSecret"}'));
  expect(response.status).toBe(unavailable ? 503 : 429);
  expect(verifyHfToken).not.toHaveBeenCalled();
});
it.each([
  ["{", {}, 400], ['{"token":"your_token_here"}', {}, 400],
  ["x".repeat(1025), {}, 413], ['{"token":"hf_test"}', { "content-length": "1025" }, 413],
  [JSON.stringify({ token: "hf_test", padding: "é".repeat(600) }), {}, 413]
])("rejects invalid or oversized envelopes", async (body, headers, status) => {
  const response = await POST(request(body as string, headers));
  expect(response.status).toBe(status);
  expect(verifyHfToken).not.toHaveBeenCalled();
});
it("returns only a non-cacheable status and scopes the rate limit", async () => {
  const response = await POST(request('{"token":"hf_testSecret"}'));
  expect(await response.json()).toEqual({ status: "accepted" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(checkLimit).toHaveBeenCalledWith("interpret", "hf-check:ip:test");
  expect(verifyHfToken).toHaveBeenCalledWith("hf_testSecret");
});
