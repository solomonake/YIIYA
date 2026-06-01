/**
 * Server-side Supabase client factories.
 * Keep this file separate from lib/supabase-client.ts (the browser client) so
 * the service-role key never leaks into the client bundle.
 *
 * Reference:
 *   https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient | null {
  if (_service) return _service;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _service;
}

/**
 * Issue a Supabase JWT-scoped client from a user access token (sent by browser).
 * Use this in route handlers so RLS policies kick in.
 */
export function userScopedClient(accessToken: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}
