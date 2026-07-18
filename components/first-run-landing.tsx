"use client";

/**
 * First-run landing.
 *
 * Drop this on `/` for fresh visitors. Six example prompts float as
 * tappable tags. On hover a one-line preview appears. Tapping kicks the
 * pipeline with that prompt — the user gets to the magic in one click.
 *
 * No big AI-slop gradient hero. Just black, a tight wordmark, and prompts.
 */
import { useState } from "react";

const EXAMPLES: ReadonlyArray<{ text: string; preview: string }> = [
  { text: "a glass cup on a warm cream backdrop", preview: "Studio product page · editorial cream + serif" },
  { text: "Bauhaus poster site for a Brooklyn coffee roaster", preview: "Print-grade poster · swiss grotesk + duotone" },
  { text: "luxury watch landing called Hours & Verge", preview: "Midnight editorial · serif headlines · still motion" },
  { text: "AI dev tool with a particle-field hero, terminal vibe", preview: "Mono terminal · reactive particles · cold midnight" },
  { text: "playful candle brand, hand-drawn type, warm palette", preview: "Warm neutral · hand-drawn · kinetic motion" },
  { text: "brutalist law firm, monochrome, big slab serifs", preview: "Monochrome · display experimental · still" }
];

export type FirstRunLandingProps = {
  /** Called when the user taps a prompt or types their own. */
  onStart: (prompt: string) => void;
};

export function FirstRunLanding({ onStart }: FirstRunLandingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [typed, setTyped] = useState("");

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--yiiya-bg, #050505)",
        color: "var(--yiiya-fg, #F2F2F2)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: "40px 32px"
      }}
    >
      <header style={{ letterSpacing: 6, fontSize: 12, opacity: 0.6 }}>YIIYA</header>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 32,
          alignItems: "stretch",
          justifyContent: "center"
        }}
        aria-labelledby="say-something"
      >
        <h1
          id="say-something"
          style={{
            fontFamily: "var(--yiiya-font-heading, serif)",
            fontWeight: 400,
            fontSize: "clamp(2rem, 5vw, 5rem)",
            lineHeight: 1.05,
            margin: 0
          }}
        >
          Say something. Anything.
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) onStart(typed.trim());
          }}
          role="search"
        >
          <label htmlFor="prompt" style={{ position: "absolute", left: -9999 }}>
            What should YIIYA build?
          </label>
          <input
            id="prompt"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="…or pick one below"
            autoComplete="off"
            spellCheck={false}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--yiiya-edge, #1F1F1F)",
              padding: "16px 0",
              color: "inherit",
              fontFamily: "var(--yiiya-font-mono, monospace)",
              fontSize: 18,
              outline: "none"
            }}
          />
        </form>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 8
          }}
        >
          {EXAMPLES.map((ex, i) => (
            <li key={ex.text}>
              <button
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onStart(ex.text)}
                style={{
                  background: "transparent",
                  color: "inherit",
                  border: "1px solid var(--yiiya-edge, #1F1F1F)",
                  padding: "10px 14px",
                  borderRadius: 0,
                  cursor: "pointer",
                  fontFamily: "var(--yiiya-font-mono, monospace)",
                  fontSize: 13
                }}
              >
                {ex.text}
              </button>
            </li>
          ))}
        </ul>
        <p
          aria-live="polite"
          style={{
            fontFamily: "var(--yiiya-font-mono, monospace)",
            fontSize: 12,
            opacity: 0.55,
            minHeight: "1.4em"
          }}
        >
          {hover !== null ? EXAMPLES[hover].preview : "Hover for a preview · tap to begin"}
        </p>
      </section>

      <footer
        style={{
          fontFamily: "var(--yiiya-font-mono, monospace)",
          fontSize: 11,
          opacity: 0.4,
          display: "flex",
          justifyContent: "space-between"
        }}
      >
        <span>3D-first design</span>
        <span>Made with YIIYA</span>
      </footer>
    </main>
  );
}
