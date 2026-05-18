"use client";

import { useYiiyaStore } from "@/lib/store";

export function CursorReticle() {
  const cursorTarget = useYiiyaStore((state) => state.cursorTarget);
  const isListening = useYiiyaStore((state) => state.isListening);
  const selectedElementId = useYiiyaStore((state) => state.selectedElementId);

  if (!cursorTarget) {
    return null;
  }

  const isLocked = Boolean(
    selectedElementId || cursorTarget.sceneObjectId
  );

  return (
    <div
      className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
      style={{ left: cursorTarget.screenX, top: cursorTarget.screenY }}
    >
      <div
        className={[
          "relative rounded-full border transition-all",
          isListening
            ? "h-10 w-10 border-[#39FF14] shadow-[0_0_26px_rgba(57,255,20,0.34)]"
            : isLocked
              ? "h-7 w-7 border-amber shadow-[0_0_18px_rgba(239,159,39,0.3)]"
              : "h-5 w-5 border-amber/60"
        ].join(" ")}
      >
        {isListening ? (
          <div className="absolute inset-0 animate-ping rounded-full border border-[#39FF14]" />
        ) : null}
      </div>
      {(isListening || isLocked) && cursorTarget.description ? (
        <div className="absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded border border-terminalBorder bg-ink/90 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-white/85">
          {isLocked ? "target locked - " : ""}
          {cursorTarget.description}
        </div>
      ) : null}
    </div>
  );
}
