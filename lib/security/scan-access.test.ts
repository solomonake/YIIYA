import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/scan-job-store", () => ({ getScanAccess: vi.fn() }));
vi.mock("@/lib/auth/verify-request", () => ({ getUserIdFromAuthHeader: vi.fn() }));
import { getScanAccess } from "@/lib/scan-job-store";
import { getUserIdFromAuthHeader } from "@/lib/auth/verify-request";
import { authorizeScanAccess } from "./scan-access";
import { issueScanAccess, verifyScanToken } from "./scan-capability";
const request = (token?: string) => new Request("https://yiiya.test", { headers: token ? { "x-yiiya-scan-token": token } : {} });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getUserIdFromAuthHeader).mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());
describe("scan ownership and scoped capability", () => {
  it("rejects bare job IDs without a database read", async () => {
    expect((await authorizeScanAccess(request(), "id"))?.status).toBe(401);
    expect(getScanAccess).not.toHaveBeenCalled();
  });
  it("accepts only matching verified owner", async () => {
    vi.mocked(getScanAccess).mockResolvedValue({ ownerId: "owner-a", tokenHash: undefined, expiresAt: undefined });
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue("owner-b");
    expect((await authorizeScanAccess(request(), "id"))?.status).toBe(403);
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue("owner-a");
    expect(await authorizeScanAccess(request(), "id")).toBeNull();
  });
  it("supports anonymous phone access only for its job and before expiry", async () => {
    const access = issueScanAccess();
    vi.mocked(getScanAccess).mockResolvedValue({ ownerId: null, ...access });
    expect(await authorizeScanAccess(request(access.token), "id")).toBeNull();
    expect((await authorizeScanAccess(request(issueScanAccess().token), "id"))?.status).toBe(403);
    vi.useFakeTimers(); vi.setSystemTime(access.expiresAt);
    expect((await authorizeScanAccess(request(access.token), "id"))?.status).toBe(403);
  });
  it("denies legacy unowned jobs without access metadata", async () => {
    vi.mocked(getScanAccess).mockResolvedValue({ ownerId: null, tokenHash: undefined, expiresAt: undefined });
    expect((await authorizeScanAccess(request(issueScanAccess().token), "legacy"))?.status).toBe(403);
  });
  it("fails closed on access store failures", async () => {
    vi.mocked(getScanAccess).mockRejectedValue(new Error("database unavailable"));
    expect((await authorizeScanAccess(request(issueScanAccess().token), "id"))?.status).toBe(503);
  });
  it("rejects malformed credentials/metadata", () => {
    const access = issueScanAccess();
    expect(verifyScanToken(access.token, "invalid", access.expiresAt)).toBe(false);
    expect(verifyScanToken(access.token, access.tokenHash, Infinity)).toBe(false);
    expect(verifyScanToken("bad", access.tokenHash, access.expiresAt)).toBe(false);
  });
});
