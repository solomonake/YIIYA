"use client";

import { useState } from "react";
import { getSettings, setSettings, clearAllLocalData } from "@/lib/settings";

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [hfToken, setHfToken] = useState(() => getSettings().hfToken);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleSave = () => {
    setSettings({ hfToken: hfToken.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearAllLocalData();
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm border border-zinc-800 bg-[#0A0A0A] rounded-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-mono text-zinc-300 tracking-widest">SETTINGS</span>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 text-xs font-mono"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[9px] font-mono text-zinc-500 mb-1.5" htmlFor="hf-token">
              YOUR HUGGING FACE TOKEN (OPTIONAL)
            </label>
            <p className="text-[9px] font-mono text-zinc-700 leading-4 mb-2">
              YIIYA&apos;s free 3D providers share a HuggingFace ZeroGPU quota across every
              visitor. Add your own token to use your personal quota instead — get one free at{" "}
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 underline"
                onClick={(e) => e.stopPropagation()}
              >
                huggingface.co/settings/tokens
              </a>
              . Stored only in this browser, never sent anywhere except your own generation
              requests.
            </p>
            <input
              id="hf-token"
              type="password"
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              placeholder="hf_..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-2 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
            />
            <button
              onClick={handleSave}
              className="mt-2 w-full py-2 bg-zinc-100 text-black text-[10px] font-mono rounded-sm hover:bg-white transition-colors"
            >
              {saved ? "Saved" : "Save token"}
            </button>
          </div>

          <div className="pt-3 border-t border-zinc-900">
            <label className="block text-[9px] font-mono text-zinc-500 mb-1.5">
              CLEAR LOCAL DATA
            </label>
            <p className="text-[9px] font-mono text-zinc-700 leading-4 mb-2">
              Removes your saved token and this browser&apos;s local asset/log history. Assets
              already saved to your account (if signed in) are not affected.
            </p>
            <button
              onClick={handleClear}
              className={`w-full py-2 text-[10px] font-mono rounded-sm border transition-colors ${
                confirmClear
                  ? "border-red-700 text-red-400 hover:bg-red-950/30"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
              }`}
            >
              {confirmClear ? "Click again to confirm" : "Clear local data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
