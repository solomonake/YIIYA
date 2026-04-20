"use client";

import { useYiiyaStore, type CanvasMode } from "@/lib/store";

const modes: CanvasMode[] = ["WEB", "3D", "HYBRID"];

export function CanvasModeToggle() {
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const setCanvasMode = useYiiyaStore((state) => state.setCanvasMode);

  return (
    <div className="pointer-events-auto absolute bottom-5 right-5 z-30 flex items-center gap-1 border border-terminalBorder bg-[#070707]/88 p-1 text-[10px] font-bold tracking-[0.12em] text-white/45 backdrop-blur">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setCanvasMode(mode)}
          className="h-6 px-2 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
          style={{
            border:
              canvasMode === mode
                ? "1px solid var(--color-amber, #EF9F27)"
                : "1px solid transparent",
            color: canvasMode === mode ? "#EF9F27" : undefined
          }}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
