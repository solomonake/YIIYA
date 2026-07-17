"use client";

import { useRouter } from "next/navigation";

const EXAMPLES = [
  { text: "a ceramic coffee mug", preview: "Everyday object · clean geometry · matte glaze" },
  { text: "a leather armchair", preview: "Furniture · soft materials · stitching detail" },
  { text: "a vintage brass lamp", preview: "Metallic finish · warm patina · period detail" },
  { text: "a pair of running shoes", preview: "Product mockup · mesh fabric · rubber sole" },
  { text: "a glass perfume bottle", preview: "Transparent material · refraction · luxury feel" },
  { text: "a wooden acoustic guitar", preview: "Organic curves · wood grain · string detail" },
];

const FEATURES = [
  { label: "Voice input", desc: "Hold SPACE and describe what you want" },
  { label: "Photo to 3D", desc: "Drop a reference image, get a model" },
  { label: "Multi-format export", desc: "GLB, OBJ, USD, STL — ready for any pipeline" },
];

export default function LandingPage() {
  const router = useRouter();

  function handleStart(prompt: string) {
    router.push(`/app?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] flex flex-col">
      {/* Header */}
      <header className="px-6 pt-8 sm:px-10 sm:pt-10">
        <span className="text-[11px] font-mono tracking-[0.4em] text-zinc-500 uppercase">
          YIIYA
        </span>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col justify-center px-6 sm:px-10 max-w-3xl py-16 sm:py-24">
        <h1
          className="font-serif font-normal leading-[1.05] mb-4"
          style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)" }}
        >
          Say something.
          <br />
          Get a 3D asset.
        </h1>
        <p className="text-zinc-500 font-mono text-sm sm:text-base max-w-lg mb-12">
          Voice-first 3D generation. Describe anything — or drop a photo — and
          get a production-ready model in seconds.
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={() => router.push("/app")}
          className="self-start px-6 py-3 text-sm font-mono tracking-wide border border-[#EF9F27] text-[#EF9F27] hover:bg-[#EF9F27] hover:text-black transition-colors duration-200 mb-14"
        >
          Open Studio
        </button>

        {/* Example prompts */}
        <div className="mb-12">
          <p className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase mb-3">
            Try one
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.text}
                type="button"
                onClick={() => handleStart(ex.text)}
                className="text-[13px] font-mono px-3 py-2 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors duration-150"
                title={ex.preview}
              >
                {ex.text}
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-10">
          {FEATURES.map((f) => (
            <div key={f.label}>
              <p className="text-[11px] font-mono text-[#EF9F27] tracking-wide mb-1">
                {f.label}
              </p>
              <p className="text-[12px] font-mono text-zinc-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 pb-8 sm:px-10 sm:pb-10 flex justify-between items-center">
        <span className="text-[10px] font-mono text-zinc-700">
          Voice-first 3D studio
        </span>
        <span className="text-[10px] font-mono text-zinc-700">
          Made with YIIYA
        </span>
      </footer>
    </main>
  );
}
