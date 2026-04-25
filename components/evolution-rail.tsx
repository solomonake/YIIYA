"use client";

import { useYiiyaStore } from "@/lib/store";

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function EvolutionRail() {
  const timelineSnapshots = useYiiyaStore((state) => state.timelineSnapshots);
  const activeTimelineSnapshotId = useYiiyaStore(
    (state) => state.activeTimelineSnapshotId
  );
  const restoreTimelineSnapshot = useYiiyaStore(
    (state) => state.restoreTimelineSnapshot
  );

  if (timelineSnapshots.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 z-20 flex justify-center px-5">
      <div className="yiiya-scrollbar flex w-[min(980px,100%)] gap-3 overflow-x-auto border border-terminalBorder bg-[#050505]/84 p-3 backdrop-blur-xl">
        {timelineSnapshots.map((snapshot) => (
          <button
            key={snapshot.id}
            type="button"
            onClick={() => restoreTimelineSnapshot(snapshot.id)}
            className="group min-w-[180px] border p-2 text-left transition"
            style={{
              borderColor:
                activeTimelineSnapshotId === snapshot.id
                  ? "#EF9F27"
                  : "#1A1A1A"
            }}
          >
            <div
              className="h-20 w-full border border-terminalBorder bg-cover bg-center"
              style={{
                backgroundImage: snapshot.htmlCanvasImage
                  ? `url(${snapshot.htmlCanvasImage})`
                  : snapshot.sceneCanvasImage
                    ? `url(${snapshot.sceneCanvasImage})`
                    : "none",
                backgroundColor: "#0C0C0C"
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-white/42">
              <span>{timeLabel(snapshot.createdAt)}</span>
              <span className="text-amber/70">
                {snapshot.brief ? `${Math.round(snapshot.brief.confidence * 100)}%` : "state"}
              </span>
            </div>
            <p className="mt-2 truncate text-[11px] font-semibold text-white/82">
              {snapshot.label}
            </p>
            <p className="mt-1 h-8 overflow-hidden text-[10px] leading-relaxed text-white/46">
              {snapshot.summary}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
