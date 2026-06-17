"use client";

import dynamic from "next/dynamic";
import { type FormEvent, Suspense, useState } from "react";
import { VoiceBar } from "@/components/voice-bar";
import { useYiiyaStore } from "@/lib/store";
import { runTranscriptThroughYiiya } from "@/lib/use-speech-interpreter";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((mod) => mod.SceneCanvas),
  { ssr: false },
);

export default function SpawnPage() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setGenerating] = useState(false);
  const activeLane = useYiiyaStore((state) => state.activeLane);
  const addLog = useYiiyaStore((state) => state.addLog);
  const resetProject = useYiiyaStore((state) => state.resetProject);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!prompt.trim() || isGenerating) {
      return;
    }

    setGenerating(true);
    resetProject();
    addLog("[SPAWN]: Asset studio quickstart initialized.");

    try {
      await runTranscriptThroughYiiya(prompt.trim());
    } catch (error) {
      addLog(
        `[SYSTEM]: ${error instanceof Error ? error.message : "Asset spawn failed."}`,
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-ink text-bone">
      <header className="z-20 flex h-12 items-center justify-between border-b border-terminalBorder px-4">
        <a
          href="/app"
          className="text-xs font-black uppercase tracking-[0.18em] text-amber"
        >
          YIIYA / Asset Spawn
        </a>
        <span className="border border-terminalBorder px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
          {activeLane}
        </span>
      </header>
      <section className="relative min-h-0 flex-1 canvas-grid">
        <Suspense fallback={<div className="h-full bg-ink" />}>
          <SceneCanvas />
        </Suspense>
        <form
          onSubmit={handleSubmit}
          className="absolute left-1/2 top-8 z-30 flex w-[min(760px,calc(100vw-32px))] -translate-x-1/2 gap-2 border border-terminalBorder bg-[#050505]/94 p-2 backdrop-blur-xl"
        >
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Design a foldable stool with hinge points and exportable CAD handoff"
            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            title={!prompt.trim() ? "Enter one asset sentence first" : "Generate asset"}
            className="h-10 border border-amber/70 bg-amber px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-ink disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30"
          >
            {isGenerating ? "Routing" : "Generate"}
          </button>
        </form>
        <VoiceBar />
      </section>
    </main>
  );
}
