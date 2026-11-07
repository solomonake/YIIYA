import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/rate-limit", () => ({ checkLimit: vi.fn(), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/security/generation-identity", () => ({ resolveGenerationIdentity: vi.fn() }));
vi.mock("@/lib/security/prompt-firewall", () => ({ inspectPrompt: vi.fn() }));
vi.mock("@/lib/brief/company-extractor", () => ({ extractBrand: vi.fn() }));
vi.mock("@/lib/billing/usage-meter", () => ({ checkBudget: vi.fn() }));
import { checkLimit } from "@/lib/security/rate-limit";
import { resolveGenerationIdentity } from "@/lib/security/generation-identity";
import { inspectPrompt } from "@/lib/security/prompt-firewall";
import { extractBrand } from "@/lib/brief/company-extractor";
import { checkBudget } from "@/lib/billing/usage-meter";
import { guardRequest } from "@/app/api/interpret/guard";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveGenerationIdentity).mockResolvedValue({ identityKey: "user:test", userId: "test", isExempt: false });
});

describe("unavailable shared limits stop generation preflight", () => {
  it.each([{}, { base64: 42 }, { base64: "bad", mediaType: "image/png", name: "mug.png" }])(
    "rejects malformed photos before identity, quota or providers %#", async referenceImage => {
      const result = await guardRequest(new NextRequest("https://yiiya.test/api/interpret"), {
        transcript: "a mug", referenceImage
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected invalid input");
      expect(result.response.status).toBe(400);
      expect(resolveGenerationIdentity).not.toHaveBeenCalled();
      expect(checkLimit).not.toHaveBeenCalled();
      expect(checkBudget).not.toHaveBeenCalled();
      expect(inspectPrompt).not.toHaveBeenCalled();
    });
  it("returns 503 before provider work when budget evidence is unavailable", async () => {
    vi.mocked(checkLimit).mockResolvedValue({ success: true, unavailable: false, remaining: 1, limit: 2, reset: 123 });
    vi.mocked(checkBudget).mockResolvedValue({ allow: false, unavailable: true, spentUsd: 0, capUsd: 10, scope: "global" });
    const result = await guardRequest(new NextRequest("https://yiiya.test/api/interpret"), { transcript: "a mug" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected closed guard");
    expect(result.error).toBe("budget_unavailable");
    expect(result.response.status).toBe(503);
    expect(inspectPrompt).not.toHaveBeenCalled();
    expect(extractBrand).not.toHaveBeenCalled();
  });
  it.each(["interpret", "generate3d"])("returns 503 before provider work when %s limiter is unavailable", async blocked => {
    vi.mocked(checkLimit).mockImplementation(async name => ({ success: name !== blocked,
      unavailable: name === blocked, remaining: 0, limit: 10, reset: Date.now() + 60_000 }));
    const result = await guardRequest(new NextRequest("https://yiiya.test/api/interpret"), { transcript: "a ceramic mug" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected closed guard");
    expect(result.response.status).toBe(503);
    expect(result.response.headers.get("Retry-After")).toBe("60");
    expect(inspectPrompt).not.toHaveBeenCalled();
    expect(extractBrand).not.toHaveBeenCalled();
    expect(checkBudget).not.toHaveBeenCalled();
  });
});
