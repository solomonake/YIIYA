"use client";

import { type FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";
import { useYiiyaStore } from "@/lib/store";

export function AuthOverlay() {
  const isGuest = useYiiyaStore((state) => state.isGuest);
  const setGuest = useYiiyaStore((state) => state.setGuest);
  const addLog = useYiiyaStore((state) => state.addLog);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const supabase = getSupabaseBrowserClient();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !supabase) {
      setStatus(
        isSupabaseConfigured()
          ? "Enter an email address."
          : "Supabase is not configured. Continue as guest."
      );
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/app`
      }
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Magic link sent. Check your email.");
  };

  if (hasSession || isGuest) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#050505] px-5 text-bone">
      <form
        onSubmit={handleSubmit}
        className="grid w-[min(420px,100%)] gap-5 text-center"
      >
        <div>
          <h1 className="text-4xl font-black tracking-[0]">Yiiya</h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-white/42">
            Say it. See it. Ship it.
          </p>
        </div>
        <label className="sr-only" htmlFor="yiiya-auth-email">
          Email
        </label>
        <input
          id="yiiya-auth-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-11 border border-terminalBorder bg-white/[0.03] px-3 text-sm text-bone outline-none transition placeholder:text-white/28 focus:border-amber"
        />
        <button
          type="submit"
          className="h-11 border border-amber/70 bg-amber px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-ink transition hover:bg-signalAmber focus:outline-none focus:ring-1 focus:ring-amber"
        >
          Send link
        </button>
        <button
          type="button"
          onClick={() => {
            setGuest(true);
            addLog("SYSTEM: Guest mode enabled.");
          }}
          className="justify-self-center text-xs text-white/42 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
        >
          Continue as guest
        </button>
        {status ? <p className="text-xs text-white/45">{status}</p> : null}
      </form>
    </div>
  );
}
