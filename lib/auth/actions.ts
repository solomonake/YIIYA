"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export type AuthActionResult = { ok: boolean; error?: string };

/**
 * Magic-link sign-in. Works out of the box on any Supabase project (email
 * provider is on by default) — no OAuth app registration required, so this is
 * the Phase 1 auth path. OAuth providers (Google, etc.) are a fast-follow
 * once someone has actually configured them in the Supabase dashboard.
 */
export async function sendMagicLink(email: string): Promise<AuthActionResult> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: "Auth is not configured on this deployment." };

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/app` : undefined
    }
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const client = getSupabaseBrowserClient();
  await client?.auth.signOut();
}
