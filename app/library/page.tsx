"use client";

import Link from "next/link";
import { useState } from "react";
import {
  SupabaseSessionProvider,
  useSupabaseSession,
} from "@/lib/auth/use-session";
import { AuthSheet } from "@/components/auth/auth-sheet";
import { signOut } from "@/lib/auth/actions";
import { LibraryAssets } from "@/components/library/library-assets";

function LibraryContent() {
  const { user, loading, isConfigured, error, retry } = useSupabaseSession();
  const [showAuth, setShowAuth] = useState(false);
  return (
    <div className="min-h-screen bg-black text-zinc-300">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[11px] font-mono text-zinc-500 tracking-widest">
              YIIYA · LIBRARY
            </div>
            <div className="text-[9px] font-mono text-zinc-700 mt-0.5">
              Your past products
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200"
            >
              ← Studio
            </Link>
            {user ? (
              <button
                onClick={() => signOut()}
                className="text-[10px] font-mono text-zinc-500 hover:text-red-400"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="text-[10px] font-mono text-zinc-700">Loading…</div>
        ) : !isConfigured ? (
          <div className="text-[10px] font-mono text-zinc-600 leading-6">
            Auth isn&apos;t configured on this deployment yet.
          </div>
        ) : error ? (
          <section className="rounded-sm border border-zinc-700 p-5">
            <div role="alert">
              <h2 className="text-base text-zinc-200">
                Sign-in check unavailable
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                We couldn&apos;t check your sign-in. Try again to load your
                Library.
              </p>
            </div>
            <button
              type="button"
              onClick={retry}
              className="mt-4 min-h-11 rounded-sm border border-amber-500 px-5 py-2 text-sm text-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
            >
              Retry sign-in check
            </button>
          </section>
        ) : !user ? (
          <div className="border border-dashed border-zinc-800 rounded-sm p-8 text-center">
            <p className="text-[11px] font-mono text-zinc-400 mb-4">
              Sign in to see your past products.
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="px-4 py-2 bg-zinc-100 text-black text-[10px] font-mono rounded-sm hover:bg-white transition-colors"
            >
              Sign in
            </button>
          </div>
        ) : (
          <LibraryAssets
            key={`${user.id}:${user.last_sign_in_at ?? ""}`}
            userId={user.id}
          />
        )}
      </div>

      {showAuth ? <AuthSheet onClose={() => setShowAuth(false)} /> : null}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <SupabaseSessionProvider>
      <LibraryContent />
    </SupabaseSessionProvider>
  );
}
