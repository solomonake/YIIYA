"use client";

/**
 * AR Quick Look anchor.
 *
 * On iOS Safari, an <a rel="ar" href="model.usdz"> tag triggers Quick Look's
 * full-screen AR placement UI. No JS, no permissions — pure HTML.
 *
 *   https://developer.apple.com/augmented-reality/quick-look/
 *
 * On Android (Chrome), we fall back to scene-viewer via an intent:// URL.
 *   https://developers.google.com/ar/develop/scene-viewer
 *
 * Other browsers get a non-AR "View 3D" link that opens the GLB in a new tab.
 */
import { useEffect, useState } from "react";

export type ArQuickLookProps = {
  /** Public HTTPS URL of the .usdz file. */
  usdzUrl: string;
  /** Public HTTPS URL of the .glb file (Android fallback + non-AR). */
  glbUrl: string;
  /** A still image used as the tappable thumbnail. */
  posterUrl: string;
  title: string;
  /** Optional Apple Pay/AR custom banner — see Apple docs. */
  applePayButtonType?: "plain" | "buy" | "checkout";
};

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function ArQuickLook({ usdzUrl, glbUrl, posterUrl, title }: ArQuickLookProps) {
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => setPlatform(detectPlatform()), []);

  if (platform === "ios") {
    return (
      <a
        rel="ar"
        href={usdzUrl}
        className="yiiya-ar-link"
        aria-label={`View ${title} in AR on your device`}
      >
        <img src={posterUrl} alt={`${title} preview`} width={512} height={512} />
        <span>View in your space</span>
      </a>
    );
  }

  if (platform === "android") {
    const sceneViewer = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(
      glbUrl
    )}&mode=ar_only&title=${encodeURIComponent(title)}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;end;`;
    return (
      <a href={sceneViewer} className="yiiya-ar-link" aria-label={`View ${title} in AR`}>
        <img src={posterUrl} alt={`${title} preview`} width={512} height={512} />
        <span>View in your space</span>
      </a>
    );
  }

  return (
    <a
      href={glbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="yiiya-ar-link"
      aria-label={`Open ${title} in 3D viewer`}
    >
      <img src={posterUrl} alt={`${title} preview`} width={512} height={512} />
      <span>View 3D</span>
    </a>
  );
}
