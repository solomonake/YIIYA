"use client";

import { useState } from "react";
import { sendMagicLink } from "@/lib/auth/actions";

export function AuthSheet({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    setError(null);
    const result = await sendMagicLink(email.trim());
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(result.error ?? "Something went wrong.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs border border-zinc-800 bg-[#0A0A0A] rounded-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-mono text-zinc-300 tracking-widest">SIGN IN</span>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 text-xs font-mono"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {status === "sent" ? (
          <div className="text-[11px] font-mono text-emerald-400 leading-5">
            Check your email — we sent a sign-in link to <span className="text-zinc-300">{email}</span>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-[10px] font-mono text-zinc-600 leading-5">
              Sign in to save your generations and see your past products.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-2 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
            />
            {error && <div className="text-[9px] font-mono text-red-500">{error}</div>}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full py-2 bg-zinc-100 text-black text-[10px] font-mono rounded-sm hover:bg-white transition-colors disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
