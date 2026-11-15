"use client";

import { useEffect, useState } from "react";
import { personalArtifactRequest } from "./hf-artifact-request";
import { getSettings } from "./settings";

/** Resolve a protected GLB before handing it to Three or model-viewer.
 * The object URL lasts only as long as this component needs the download. */
export function useArtifactSource(url: string, clearCache?: (src: string) => void) {
  const key = getSettings().hfToken;
  const needsDownload = Boolean(personalArtifactRequest(url, key));
  const [result, setResult] = useState<{ url: string; key: string; src?: string; failed?: boolean }>();
  useEffect(() => {
    const init = personalArtifactRequest(url, key);
    setResult(undefined);
    if (!init) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) throw new Error("Model download failed");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ url, key, src: objectUrl });
      } catch {
        if (!controller.signal.aborted) setResult({ url, key, failed: true });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) {
        clearCache?.(objectUrl);
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, key, clearCache]);
  if (!needsDownload) return { src: url, failed: false };
  if (result?.url !== url || result.key !== key) return { src: "", failed: false };
  return { src: result.src ?? "", failed: Boolean(result.failed) };
}
