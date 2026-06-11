"use client";

import { useYiiyaStore } from "@/lib/store";

export function CanvasModeToggle() {
  const canvasMode = useYiiyaStore((state) => state.canvasMode);

  return (
    <div className="pointer-events-auto absolute bottom-5 right-5 z-30 flex items-center gap-2 border border-terminalBorder bg-[#070707]/88 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 backdrop-blur">
      <span className="text-white/32">Workspace</span>
      <span
        className="border px-2 py-1"
        style={{
          borderColor: "rgba(239,159,39,0.42)",
          color: canvasMode === "3D" ? "#EF9F27" : "rgba(255,255,255,0.52)"
        }}
      >
        3D shell
      </span>
    </div>
  );
}
