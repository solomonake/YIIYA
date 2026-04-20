"use client";

import dynamic from "next/dynamic";
import { type FormEvent, Suspense, useState } from "react";
import { PitchMap } from "@/components/pitch-map";
import { WebsiteLayer } from "@/components/website-layer";
import { VoiceBar } from "@/components/voice-bar";
import { runYiiyaActions } from "@/lib/action-runner";
import { useYiiyaStore, type YiiyaAction } from "@/lib/store";

const SceneCanvas = dynamic(
  () => import("@/components/scene-canvas").then((mod) => mod.SceneCanvas),
  { ssr: false }
);

function isActionPayload(value: unknown): value is { actions: YiiyaAction[]; qa_log?: string[] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as { actions?: unknown; qa_log?: unknown };

  return Array.isArray(record.actions);
}

export default function SpawnPage() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setGenerating] = useState(false);
  const [pitchMapOpen, setPitchMapOpen] = useState(false);
  const addLog = useYiiyaStore((state) => state.addLog);
  const addActionLogs = useYiiyaStore((state) => state.addActionLogs);
  const resetProject = useYiiyaStore((state) => state.resetProject);
  const setStrategyMode = useYiiyaStore((state) => state.setStrategyMode);
  const currentProjectId = useYiiyaStore((state) => state.currentProjectId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!prompt.trim() || isGenerating) {
      return;
    }

    setGenerating(true);
    resetProject();
    setStrategyMode(true);
    addLog("[SPAWN]: Founder funnel initialized.");

    try {
      const canvas = {
        projectId: currentProjectId,
        sections: [],
        sceneObjects: [],
        themeState: {},
        layers: []
      };
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: `Create a founder pack for: ${prompt}. Include a premium landing page, one 3D brand object, and roadmap copy.`,
          activeElementId: null,
          current_canvas_json: canvas,
          strategyMode: true
        })
      });

      if (!response.ok) {
        throw new Error(`Spawn failed with ${response.status}`);
      }

      const payload: unknown = await response.json();

      if (!isActionPayload(payload)) {
        throw new Error("Spawn returned invalid actions");
      }

      runYiiyaActions(payload.actions);
      addActionLogs(payload.actions);
      payload.qa_log?.forEach((log) => addLog(log));
      setPitchMapOpen(true);
    } catch (error) {
      addLog(`[SYSTEM]: ${error instanceof Error ? error.message : "Spawn failed."}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-ink text-bone">
      <header className="z-20 flex h-12 items-center justify-between border-b border-terminalBorder px-4">
        <a href="/app" className="text-xs font-black uppercase tracking-[0.18em] text-amber">
          YIIYA / Spawn
        </a>
        <button
          type="button"
          onClick={() => setPitchMapOpen(true)}
          className="h-8 border border-terminalBorder px-3 text-[11px] uppercase tracking-[0.12em] text-white/60 transition hover:border-amber/70 hover:text-amber"
        >
          Pitch Map
        </button>
      </header>
      <section className="relative min-h-0 flex-1 canvas-grid">
        <Suspense fallback={<div className="h-full bg-ink" />}>
          <SceneCanvas />
          <WebsiteLayer />
        </Suspense>
        <form
          onSubmit={handleSubmit}
          className="absolute left-1/2 top-8 z-30 flex w-[min(760px,calc(100vw-32px))] -translate-x-1/2 gap-2 border border-terminalBorder bg-[#050505]/94 p-2 backdrop-blur-xl"
        >
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="I want to start a high-end watch brand"
            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            title={!prompt.trim() ? "Enter one founder sentence first" : "Generate founder pack"}
            className="h-10 border border-amber/70 bg-amber px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-ink disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30"
          >
            {isGenerating ? "Building" : "Spawn"}
          </button>
        </form>
        <VoiceBar />
        <PitchMap open={pitchMapOpen} onClose={() => setPitchMapOpen(false)} />
      </section>
    </main>
  );
}
