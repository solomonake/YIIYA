"use client";

import { useState, type ComponentProps } from "react";
import { personalArtifactRequest } from "@/lib/hf-artifact-request";
import { getSettings } from "@/lib/settings";

export function ArtifactDownload({ href, onClick, children, ...props }: ComponentProps<"a"> & { href: string }) {
  const [error, setError] = useState(false);
  return <>
    <a {...props} href={href} onClick={async event => {
      onClick?.(event);
      const init = personalArtifactRequest(href, getSettings().hfToken);
      if (!init || event.defaultPrevented) return;
      event.preventDefault();
      setError(false);
      try {
        const response = await fetch(href, init);
        if (!response.ok) throw new Error("Download failed");
        const local = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = local;
        link.download = typeof props.download === "string" ? props.download : "model.glb";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(local), 60_000);
      } catch { setError(true); }
    }}>{children}</a>
    {error && <span role="alert">Download failed. Check your Hugging Face key or regenerate the expired file.</span>}
  </>;
}
