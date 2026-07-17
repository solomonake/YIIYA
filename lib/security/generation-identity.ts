import type { NextRequest } from "next/server";
import { hashIp } from "@/lib/security/rate-limit";
import { userScopedClient } from "@/lib/supabase-server";

export type GenerationIdentity = {
  identityKey: string;
  userId: string | null;
  isExempt: boolean;
};

const EXEMPT_EMAILS: Set<string> = new Set(
  (process.env.YIIYA_GENERATION_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export async function resolveGenerationIdentity(
  req: NextRequest
): Promise<GenerationIdentity> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    const client = token ? userScopedClient(token) : null;
    if (client) {
      try {
        const { data, error } = await client.auth.getUser(token);
        if (!error && data.user) {
          const email = data.user.email?.toLowerCase() ?? "";
          return {
            identityKey: `user:${data.user.id}`,
            userId: data.user.id,
            isExempt: EXEMPT_EMAILS.has(email),
          };
        }
      } catch {
        // Fall through to anonymous
      }
    }
  }

  const ip =
    req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const hash = await hashIp(ip);
  return { identityKey: `ip:${hash}`, userId: null, isExempt: false };
}
