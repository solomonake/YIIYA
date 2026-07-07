import type { NextRequest } from "next/server";
import { userScopedClient } from "@/lib/supabase-server";

/**
 * Resolves the authenticated user's id from an `Authorization: Bearer
 * <access_token>` header. Returns null for anonymous requests (generation
 * still works; it just isn't saved to /library) or invalid/expired tokens —
 * never throws, since auth is optional on the generation path.
 */
export async function getUserIdFromAuthHeader(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const client = userScopedClient(token);
  if (!client) return null;

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
