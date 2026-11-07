import { NextResponse, type NextRequest } from "next/server";
import { normalizeHfToken, verifyHfToken } from "@/lib/huggingface-access";
import { checkLimit } from "@/lib/security/rate-limit";
import { resolveGenerationIdentity } from "@/lib/security/generation-identity";

function reply(status: string, code = 200) {
  return NextResponse.json({ status }, { status: code, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const identity = await resolveGenerationIdentity(request);
  const limit = await checkLimit("interpret", `hf-check:${identity.identityKey}`);
  if (limit.unavailable) return reply("unavailable", 503);
  if (!limit.success) return reply("rate_limited", 429);
  if (Number(request.headers.get("content-length")) > 1024) {
    await request.body?.cancel();return reply("invalid_format", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return reply("invalid_format", 400);
  let body = "", bytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const part = await reader.read();if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024) { await reader.cancel();return reply("invalid_format", 413); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    const value: unknown = JSON.parse(body);
    const token = normalizeHfToken(typeof value === "object" && value !== null && "token" in value ? value.token : undefined);
    if (!token) return reply("invalid_format", 400);
    return reply(await verifyHfToken(token));
  } catch { await reader.cancel().catch(() => undefined);return reply("invalid_format", 400); }
  finally { reader.releaseLock(); }
}
