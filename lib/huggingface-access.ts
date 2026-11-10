/** Syntax screening only. Acceptance by HF and model/quota access require separate checks. */
export function normalizeHfToken(value: unknown): `hf_${string}` | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  return token.length <= 256 && /^hf_[A-Za-z0-9]+$/.test(token)
    ? token as `hf_${string}` : undefined;
}

/** An explicitly supplied invalid personal key must not consume shared server quota. */
export function resolveHfToken(personal: unknown, server: unknown): `hf_${string}` | undefined {
  if (typeof personal === "string" && personal.trim()) return normalizeHfToken(personal);
  return normalizeHfToken(server);
}

export type HfCredentialStatus = "accepted" | "rejected" | "rate_limited" | "unavailable" | "invalid_format";

/** Read-only identity check. Never return/log identity data, token values, or upstream bodies. */
export async function verifyHfToken(value: unknown, fetcher: typeof fetch = fetch): Promise<HfCredentialStatus> {
  const token = normalizeHfToken(value);
  if (!token) return "invalid_format";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher("https://huggingface.co/api/whoami-v2", {
      method: "GET", headers: { Authorization: `Bearer ${token}` },
      cache: "no-store", redirect: "error", signal: controller.signal
    });
    await response.body?.cancel();
    if (response.status === 200) return "accepted";
    if (response.status === 401 || response.status === 403) return "rejected";
    return response.status === 429 ? "rate_limited" : "unavailable";
  } catch { return "unavailable"; }
  finally { clearTimeout(timeout); }
}

/** Upstream failures may include request credentials; never forward their text. */
export function hfFailureMessage(error: unknown): string {
  let message = "";
  if (typeof error === "string") message = error;
  else if (error instanceof Error) message = error.message;
  else if (error && typeof error === "object") {
    for (const key of ["message", "detail", "error", "title"] as const) {
      const value = (error as Record<string, unknown>)[key];
      if (typeof value === "string") { message = value; break; }
    }
  }
  if (/quota|rate.?limit|too many requests/i.test(message)) return "Hugging Face quota or rate limit reached. Try again when your allowance resets.";
  if (/unauthori[sz]ed|forbidden|invalid.{0,20}token|authentication|401|403/i.test(message)) return "Hugging Face access was rejected. Check your token and model permissions.";
  if (/timed?\s*out|timeout|aborted|cancelled/i.test(message)) return "Hugging Face request stopped or timed out. Remote completion may be unknown.";
  return "Hugging Face generation failed. The provider may be unavailable or the input unsupported.";
}
