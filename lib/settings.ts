"use client";

// Local-only user preferences — never sent anywhere except as part of the
// user's own generation requests (the HF token). Nothing here touches the
// server's own env-configured credentials.

const STORAGE_KEY = "yiiya_settings_v1";
const ZUSTAND_PERSIST_KEY = "yiiya-studio-session";

export type YiiyaSettings = {
  /** BYO HuggingFace token — unlocks the user's own free ZeroGPU quota instead of the shared server one. */
  hfToken: string;
};

const DEFAULT_SETTINGS: YiiyaSettings = { hfToken: "" };

export function getSettings(): YiiyaSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setSettings(patch: Partial<YiiyaSettings>): void {
  if (typeof window === "undefined") return;
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Wipes local preferences and the persisted studio session (assets, logs, history). */
export function clearAllLocalData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ZUSTAND_PERSIST_KEY);
}
