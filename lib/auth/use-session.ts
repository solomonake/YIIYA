"use client";

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";

export type SessionState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
};

/**
 * Live Supabase auth session for client components. Subscribes to
 * onAuthStateChange so sign-in/sign-out (including the magic-link redirect
 * back into /app) updates every consumer without a page reload.
 */
export function useSupabaseSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    client.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading, isConfigured: isSupabaseConfigured() };
}
