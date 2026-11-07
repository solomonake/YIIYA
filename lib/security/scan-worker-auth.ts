import { createHash, timingSafeEqual } from "node:crypto";

/** Missing worker configuration must never turn an endpoint into public access. */
export function authorizeScanWorker(
  request: Request,
  secretName: "SCAN_FAL_WEBHOOK_SECRET" | "SCAN_RECONSTRUCTION_WEBHOOK_SECRET",
  header: "x-yiiya-webhook-secret" | "x-yiiya-worker-secret"
): Response | null {
  const expected = process.env[secretName];
  if (!expected?.trim()) {
    return Response.json({ error: "Worker authentication is not configured." }, { status: 503 });
  }
  const provided = request.headers.get(header);
  if (!provided || provided.length > 4096) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Fixed-size digests avoid leaking the configured secret's length in comparison.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(provided), digest(expected))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
