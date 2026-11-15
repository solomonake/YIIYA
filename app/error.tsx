"use client";

import { useEffect, useRef } from "react";

import { RecoveryPanel } from "@/components/recovery-panel";

/**
 * Route error boundary. Replaces the framework's blank "Application error"
 * screen when a page throws while rendering.
 *
 * The error message is never shown: it can carry internal detail. Only the
 * framework digest is shown, as a reference a visitor can quote.
 */
export default function RouteError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error);
    // The failed page's focused element is gone, so start keyboard and
    // screen reader users at the message.
    headingRef.current?.focus();
  }, [error]);

  return (
    <RecoveryPanel eyebrow="Something went wrong" title="This page hit a problem." headingRef={headingRef}>
      <div role="alert" className="space-y-5">
        <p>
          The page stopped before it finished loading. Try again. If it keeps happening, reload the page or
          choose a starting point below.
        </p>
        {error.digest ? (
          <p className="font-mono text-sm text-zinc-400">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={reset}
        className="border border-[#EF9F27] px-5 py-3 font-mono text-sm text-[#EF9F27] hover:bg-[#EF9F27] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EF9F27]"
      >
        Try again
      </button>
    </RecoveryPanel>
  );
}
