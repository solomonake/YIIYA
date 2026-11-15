import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/seo/site";

const title = "How it works | YIIYA";
const description = "Choose on-device photo modeling or the hosted 3D studio. Learn how to prepare images, inspect a mesh and choose an export.";
export const metadata: Metadata = {
  title, description,
  alternates: { canonical: absoluteUrl("/how-it-works") },
  openGraph: { title, description, url: absoluteUrl("/how-it-works"), type: "website", siteName: "YIIYA" },
  twitter: { title, description, card: "summary_large_image" }
};

export default function HowItWorks() {
  return <main className="min-h-screen bg-[#050505] px-6 py-8 text-zinc-200 sm:px-10">
    <div className="mx-auto max-w-6xl">
      <nav aria-label="Main" className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6 font-mono text-sm">
        <Link href="/" className="tracking-[0.3em] text-zinc-300">YIIYA</Link>
        <Link href="/app" className="text-[#EF9F27] underline underline-offset-4">Open Studio</Link>
      </nav>
      <header className="max-w-3xl py-14 sm:py-20">
        <p className="mb-5 font-mono text-xs uppercase tracking-widest text-[#EF9F27]">From idea to inspectable mesh</p>
        <h1 className="font-serif text-5xl leading-tight sm:text-6xl">Start with an object.<br />Choose your path.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">Try a simple shape, inspect the result from every side, then export it for your next tool. YIIYA is experimental, so review every model before using it in a project.</p>
      </header>
      <section aria-label="Choose a creation path" className="grid gap-6 md:grid-cols-2">
        <article className="flex flex-col border border-zinc-700 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-[#EF9F27]">On your device</p>
          <h2 className="mt-3 font-serif text-3xl">Build from two photos</h2>
          <p className="mt-4 leading-relaxed text-zinc-400">Use front and right views of a still object. Photo Studio estimates a mesh from the outlines, with a cutout editor for corrections.</p>
          <ol className="my-6 list-decimal space-y-3 pl-5 leading-relaxed">
            <li>Keep the object upright and the camera at the same height for both views.</li>
            <li>Check each cutout. Remove background areas or restore parts that were missed.</li>
            <li>Build, orbit the preview and download a GLB. Try the example before choosing your own photos.</li>
          </ol>
          <p className="mb-6 text-sm leading-relaxed text-zinc-400">Photos stay on your device in this tool. Hidden surfaces and real-world scale are estimates. Outlines alone cannot recover every cavity, texture or small detail.</p>
          <Link href="/photo-studio" className="mt-auto inline-block self-start border border-[#EF9F27] px-5 py-3 font-mono text-sm text-[#EF9F27] hover:bg-[#EF9F27] hover:text-black">Build from two photos</Link>
        </article>
        <article className="flex flex-col border border-zinc-700 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-[#EF9F27]">Hosted generation</p>
          <h2 className="mt-3 font-serif text-3xl">Describe it in the studio</h2>
          <p className="mt-4 leading-relaxed text-zinc-400">Type an idea, use voice where your browser supports it, or add a reference photo. The hosted studio sends the request to its generation service.</p>
          <ol className="my-6 list-decimal space-y-3 pl-5 leading-relaxed">
            <li>Describe one object, its shape and material. Keep the first request simple.</li>
            <li>Check availability and quota messages. A request can fail without producing a model.</li>
            <li>Inspect a successful result before downloading an available export.</li>
          </ol>
          <p className="mb-6 text-sm leading-relaxed text-zinc-400">Generation depends on provider availability and your allowance. Queue times vary. If hosted generation is unavailable, you can still try the on-device Photo Studio.</p>
          <Link href="/app" className="mt-auto inline-block self-start border border-zinc-500 px-5 py-3 font-mono text-sm hover:border-[#EF9F27] hover:text-[#EF9F27]">Open the hosted studio</Link>
        </article>
      </section>
      <section aria-labelledby="exports" className="my-14 border-t border-zinc-800 pt-10">
        <h2 id="exports" className="font-serif text-3xl">Choose an export you can use</h2>
        <dl className="mt-6 grid gap-8 sm:grid-cols-3">
          <div><dt className="font-mono text-[#EF9F27]">GLB</dt><dd className="mt-2 leading-relaxed text-zinc-400">The on-device tool downloads GLB. Use it for a compact mesh handoff and inspect it in a compatible viewer or 3D editor.</dd></div>
          <div><dt className="font-mono text-[#EF9F27]">OBJ / STL</dt><dd className="mt-2 leading-relaxed text-zinc-400">Available for supported hosted assets. Inspect geometry and set the scale in your editor; a mesh export is not a guarantee of print readiness.</dd></div>
          <div><dt className="font-mono text-[#EF9F27]">AR / USDZ</dt><dd className="mt-2 leading-relaxed text-zinc-400">AR depends on the device, browser and asset format. USDZ conversion needs separate setup, so iPhone Quick Look is not guaranteed.</dd></div>
        </dl>
      </section>
      <footer className="flex flex-wrap gap-6 border-t border-zinc-800 py-6 font-mono text-sm text-zinc-400">
        <Link href="/" className="underline underline-offset-4">Back to YIIYA</Link>
        <Link href="/photo-studio/mug" className="underline underline-offset-4">Try the guided mug fit</Link>
        <Link href="/research/mug" className="underline underline-offset-4">See the mug studies</Link>
      </footer>
    </div>
  </main>;
}
