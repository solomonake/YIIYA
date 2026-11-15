import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
export const SCAN_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
export function hashScanToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function issueScanAccess() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashScanToken(token), expiresAt: Date.now() + SCAN_ACCESS_TTL_MS };
}
export function verifyScanToken(token: string | null, hash: unknown, expiry: unknown): boolean {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || typeof hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(hash) || typeof expiry !== "number" || !Number.isFinite(expiry) || expiry <= Date.now()) return false;
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hashScanToken(token), "hex"));
}
