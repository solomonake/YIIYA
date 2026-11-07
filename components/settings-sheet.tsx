"use client";

import { useState } from "react";
import { normalizeHfToken } from "@/lib/huggingface-access";
import { getSettings, setSettings, clearAllLocalData } from "@/lib/settings";

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [hfToken, setHfToken] = useState(() => getSettings().hfToken);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const formatValid = !hfToken.trim() || Boolean(normalizeHfToken(hfToken));
  async function checkToken() {
    if (!normalizeHfToken(hfToken)) {setCheckMessage("Enter a token starting with hf_. Do not use a placeholder.");return;}
    setChecking(true);setCheckMessage("");
    try {
      const response=await fetch("/api/huggingface/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:hfToken.trim()}),signal:AbortSignal.timeout(12000)});
      const data=await response.json();
      const messages:Record<string,string>={accepted:"Hugging Face accepts this token. Model permissions, GPU quota and generation quality still need a model test.",rejected:"Hugging Face rejected this token. Check that it is current and has the access you intend.",rate_limited:"Too many checks. Wait before trying again.",invalid_format:"Enter a complete Hugging Face token starting with hf_.",unavailable:"Could not verify access now. This does not mean the token is invalid."};
      setCheckMessage(messages[data.status]??messages.unavailable);
    } catch {setCheckMessage("Could not verify access now. Try again later.");}
    finally {setChecking(false);}
  }
  const [confirmClear, setConfirmClear] = useState(false);

  const handleSave = () => {
    if (!formatValid) return;
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
              Hugging Face Spaces have queues and usage limits. A server token shares its
              quota across visitors; your own token uses your account&apos;s allowance. Get a token at{" "}
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 underline"
                onClick={(e) => e.stopPropagation()}
              >
                huggingface.co/settings/tokens
              </a>
              . Stored in this browser and sent to YIIYA&apos;s server for Hugging Face
              generation requests. Your Hugging Face account&apos;s quota and billing settings apply.
            </p>
            <input
              id="hf-token"
              type="password"
              value={hfToken}
              onChange={(e) => {setHfToken(e.target.value);setCheckMessage("");setSaved(false);}}
              disabled={checking}
              autoComplete="off"
              spellCheck={false}
              placeholder="hf_..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-2 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
            />
            {!formatValid && <p className="mt-2 text-xs text-amber-300">Use a complete token beginning with hf_, not a placeholder.</p>}
            <button type="button" onClick={checkToken} disabled={checking || !hfToken.trim() || !formatValid} className="mt-2 w-full py-2 border border-zinc-600 text-zinc-200 text-xs disabled:opacity-50">
              {checking ? "Checking access…" : "Check token access"}
            </button>
            {checkMessage && <p role="status" className="mt-2 text-xs text-zinc-300">{checkMessage}</p>}
            <button
              disabled={!formatValid || checking}
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
