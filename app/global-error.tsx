"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for a failure in the root layout itself. It replaces
 * the whole document, so it renders its own html and body and uses inline
 * styles: the site stylesheet may not be present when this shows.
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const action = {
    display: "inline-block",
    border: "1px solid #EF9F27",
    background: "transparent",
    color: "#EF9F27",
    padding: "12px 20px",
    font: "inherit",
    fontSize: 14,
    textDecoration: "none",
    cursor: "pointer"
  } as const;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#050505",
          color: "#e4e4e7",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
        }}
      >
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
          <p style={{ color: "#EF9F27", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            YIIYA
          </p>
          <div role="alert">
            <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: "16px 0" }}>YIIYA could not load.</h1>
            <p style={{ color: "#a1a1aa", lineHeight: 1.6 }}>
              Something failed before the page could start. Try again, or reload the home page.
            </p>
            {error.digest ? (
              <p style={{ color: "#a1a1aa", fontSize: 14 }}>
                Reference: <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 24 }}>
            <button type="button" onClick={reset} style={action}>
              Try again
            </button>
            {/* A plain anchor: a full page load is the recovery here. */}
            <a href="/" style={action}>
              Reload the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
