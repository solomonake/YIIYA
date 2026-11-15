import type { ReactNode, Ref } from "react";

import { recoveryLinks } from "@/lib/site/recovery-links";

/**
 * Shared shell for the not-found page and the route error boundary.
 *
 * It has no hooks, so the not-found page stays a server component. Links are
 * plain anchors on purpose: a full page load is what recovers a visitor whose
 * tab holds stale or broken client code, which client-side routing would keep.
 */
export function RecoveryPanel({
  eyebrow,
  title,
  headingRef,
  children
}: {
  eyebrow: string;
  title: string;
  /** When set, the heading can take focus so the boundary can move focus to it. */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <main data-recovery-page className="min-h-screen bg-[#050505] px-6 py-8 text-zinc-200 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <nav
          aria-label="Main"
          className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6 font-mono text-sm"
        >
          <a href="/" className="tracking-[0.3em] text-zinc-300">
            YIIYA
          </a>
        </nav>
        <header className="py-14 sm:py-16">
          <p className="mb-5 font-mono text-xs uppercase tracking-widest text-[#EF9F27]">{eyebrow}</p>
          <h1
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
            className="font-serif text-4xl leading-tight outline-none sm:text-5xl"
          >
            {title}
          </h1>
          <div className="mt-6 max-w-2xl space-y-5 text-lg leading-relaxed text-zinc-400">{children}</div>
        </header>
        <section aria-labelledby="recovery-links" className="border-t border-zinc-800 pt-10">
          <h2 id="recovery-links" className="font-serif text-2xl">
            Where to go next
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {recoveryLinks.map((link) => (
              <li key={link.href} className="border border-zinc-700 p-5">
                <a
                  href={link.href}
                  className="font-mono text-sm text-[#EF9F27] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EF9F27]"
                >
                  {link.label}
                </a>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{link.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
