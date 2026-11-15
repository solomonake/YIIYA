"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase-client";

export type SessionState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  error: boolean;
  retry: () => void;
};
type Snapshot = Pick<SessionState, "session" | "loading" | "error">;
const SessionContext = createContext<SessionState | null>(null);
const checking: Snapshot = { session: null, loading: true, error: false };

/** One auth subscription per Library/Studio page; no session reads on public pages. */
export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(checking);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setSnapshot(checking);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let initialReadOpen = true;
    let unsubscribe: (() => void) | undefined;
    const fail = () => {
      if (!active || !initialReadOpen) return;
      initialReadOpen = false;
      clearTimeout(timeout);
      setSnapshot({ session: null, loading: false, error: true });
    };
    const timeout = setTimeout(fail, 15_000);
    try {
      const client = getSupabaseBrowserClient();
      if (!client) {
        initialReadOpen = false;
        clearTimeout(timeout);
        setSnapshot({ session: null, loading: false, error: false });
      } else {
        // Register first. A new auth event always wins over the startup snapshot.
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (!active || (event === "INITIAL_SESSION" && !initialReadOpen))
            return;
          initialReadOpen = false;
          clearTimeout(timeout);
          setSnapshot({ session, loading: false, error: false });
        });
        unsubscribe = () => data.subscription.unsubscribe();
        if (initialReadOpen)
          void (async () => {
            try {
              const { data, error } = await client.auth.getSession();
              if (!active || !initialReadOpen) return;
              if (error) {
                fail();
                return;
              }
              initialReadOpen = false;
              clearTimeout(timeout);
              setSnapshot({
                session: data.session,
                loading: false,
                error: false,
              });
            } catch {
              fail();
            }
          })();
      }
    } catch {
      fail();
    }
    return () => {
      active = false;
      initialReadOpen = false;
      clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [attempt]);

  return createElement(
    SessionContext.Provider,
    {
      value: {
        ...snapshot,
        user: snapshot.session?.user ?? null,
        isConfigured: isSupabaseConfigured(),
        retry,
      },
    },
    children,
  );
}

/** UI state only. Server authorization and RLS still validate access independently. */
export function useSupabaseSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error("Sign-in state requires SupabaseSessionProvider");
  return state;
}
