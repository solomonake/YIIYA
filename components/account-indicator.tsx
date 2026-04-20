"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { useYiiyaStore } from "@/lib/store";

export function AccountIndicator() {
  const isGuest = useYiiyaStore((state) => state.isGuest);
  const setGuest = useYiiyaStore((state) => state.setGuest);
  const addLog = useYiiyaStore((state) => state.addLog);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);

      if (data.user) {
        setGuest(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);

      if (session?.user) {
        setGuest(false);
      }
    });

    return () => data.subscription.unsubscribe();
  }, [setGuest]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setOpen(false);
    addLog("SYSTEM: Signed out.");
  };

  if (user) {
    const email = user.email ?? "user";
    const initial = email.slice(0, 1).toUpperCase();

    return (
      <div className="relative">
        <button
          type="button"
          aria-label="Account"
          onClick={() => setOpen((value) => !value)}
          className="grid h-8 w-8 place-items-center rounded-full border border-terminalBorder bg-white/[0.04] text-[11px] font-bold text-bone transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
        >
          {initial}
        </button>
        {open ? (
          <div className="absolute right-0 top-10 z-50 w-44 border border-terminalBorder bg-ink p-2 text-xs shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
            <p className="truncate px-2 py-1 text-white/45">{email}</p>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-1 h-8 w-full text-left text-white/65 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!isGuest) {
    return null;
  }

  return (
    <div className="flex h-8 items-center gap-2 text-[11px] text-white/38">
      <span>guest</span>
      <button
        type="button"
        onClick={() => setGuest(false)}
        className="text-white/55 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
      >
        Sign in
      </button>
    </div>
  );
}
