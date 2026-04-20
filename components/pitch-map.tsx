"use client";

import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useMemo } from "react";
import { useYiiyaStore } from "@/lib/store";

function node(id: string, label: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    data: { label },
    style: {
      width: 190,
      border: "1px solid #1A1A1A",
      borderRadius: 4,
      background: "rgba(5,5,5,0.94)",
      color: "#EDEDED",
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 11,
      padding: 12
    }
  };
}

export function PitchMap({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const sections = useYiiyaStore((state) => state.sections);
  const projectName = useYiiyaStore((state) => state.projectName);

  const { nodes, edges } = useMemo(() => {
    const sectionNodes = sections.slice(0, 6).map((section, index) =>
      node(
        section.id,
        `${section.sectionType}: ${String(
          section.content.heading ?? section.content.title ?? projectName
        ).slice(0, 42)}`,
        280 + index * 220,
        index % 2 === 0 ? 80 : 220
      )
    );
    const journeyNodes = [
      node("visitor", "Visitor lands with intent", 20, 150),
      node("cta", "Primary CTA converts interest", 280 + sectionNodes.length * 220, 150),
      node("roadmap", "First 3 moves: content, ads, proof", 520 + sectionNodes.length * 220, 150)
    ];
    const allNodes = [journeyNodes[0], ...sectionNodes, journeyNodes[1], journeyNodes[2]];
    const allEdges: Edge[] = allNodes.slice(0, -1).map((current, index) => ({
      id: `${current.id}-${allNodes[index + 1].id}`,
      source: current.id,
      target: allNodes[index + 1].id,
      animated: true,
      style: { stroke: "#EF9F27" }
    }));

    return { nodes: allNodes, edges: allEdges };
  }, [projectName, sections]);

  if (!open) {
    return null;
  }

  return (
    <aside className="absolute bottom-0 left-0 top-12 z-50 w-[min(860px,calc(100vw-220px))] border-r border-terminalBorder bg-ink/98 p-4 text-bone backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-amber">
            Pitch Map
          </h2>
          <p className="mt-1 text-[11px] text-white/42">
            Founder journey generated from the current canvas.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 border border-terminalBorder px-3 text-[11px] uppercase tracking-[0.12em] text-white/55 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
        >
          Close
        </button>
      </div>
      <div className="h-[calc(100%-56px)] border border-terminalBorder bg-[#050505]">
        {sections.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-white/38">
            Generate a page to build the founder journey.
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} fitView colorMode="dark">
            <Background color="#1A1A1A" gap={32} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </aside>
  );
}
