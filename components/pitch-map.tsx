"use client";

import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler
} from "@xyflow/react";
import { type FormEvent, useMemo, useState } from "react";
import { useYiiyaStore, type YiiyaSection } from "@/lib/store";

type PitchNodeData = {
  label: string;
  subtitle?: string;
  elementId?: string;
  sectionId?: string;
};

function node(
  id: string,
  label: string,
  subtitle: string,
  x: number,
  y: number,
  data?: Partial<PitchNodeData>
): Node<PitchNodeData> {
  return {
    id,
    position: { x, y },
    data: { label, subtitle, ...data },
    style: {
      width: 210,
      border: "1px solid #1A1A1A",
      borderRadius: 4,
      background: "rgba(5,5,5,0.96)",
      color: "#EDEDED",
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 11,
      padding: 12
    }
  };
}

function primaryElementId(sectionType: string, index: number) {
  const lower = sectionType.toLowerCase();

  if (sectionType === "NAVBAR") {
    return `navbar-brand-${index}`;
  }

  if (sectionType === "FOOTER") {
    return `footer-brand-${index}`;
  }

  return `${lower}-title-${index}`;
}

function strategyNodes(projectName: string, sections: YiiyaSection[]) {
  const hero = sections.find((section) => section.sectionType === "HERO");
  const offer = sections.find((section) =>
    ["SERVICES", "FEATURES", "PRICING"].includes(section.sectionType)
  );
  const proof = sections.find((section) =>
    ["TESTIMONIALS", "METRICS", "LOGO_STRIP"].includes(section.sectionType)
  );
  const contact = sections.find((section) => section.sectionType === "CONTACT");
  const editableData = (section?: YiiyaSection) =>
    section
      ? {
          sectionId: section.id,
          elementId: primaryElementId(section.sectionType, sections.indexOf(section) + 1)
        }
      : undefined;

  return [
    node("audience", "Audience", `Who ${projectName} must win in the first scan`, 20, 70),
    node(
      "offer",
      "Offer",
      String(offer?.content.heading ?? offer?.content.title ?? "Make the main promise concrete"),
      260,
      70,
      editableData(offer)
    ),
    node(
      "proof",
      "Proof",
      String(proof?.content.heading ?? proof?.content.title ?? "Add trust, numbers, or customer evidence"),
      500,
      70,
      editableData(proof)
    ),
    node(
      "cta",
      "CTA",
      String(contact?.content.heading ?? hero?.content.cta ?? "Give the visitor one obvious next step"),
      740,
      70,
      editableData(contact)
    ),
    node(
      "objections",
      "Objections",
      "Answer price, trust, timeline, and fit before hesitation starts",
      380,
      245
    ),
    node(
      "growth",
      "First 3 growth moves",
      "Capture demand, retarget interest, and publish proof every week",
      620,
      245
    )
  ];
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
  const setSelectedElementId = useYiiyaStore((state) => state.setSelectedElementId);
  const setSelectedElements = useYiiyaStore((state) => state.setSelectedElements);
  const updateElementContent = useYiiyaStore((state) => state.updateElementContent);
  const removeSection = useYiiyaStore((state) => state.removeSection);
  const addLog = useYiiyaStore((state) => state.addLog);
  const [activeNode, setActiveNode] = useState<Node<PitchNodeData> | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [view, setView] = useState<"strategy" | "flow">("strategy");

  const { nodes, edges } = useMemo(() => {
    const sectionNodes = sections.slice(0, 8).map((section, index) => {
      const number = index + 1;
      const label = String(
        section.content.heading ??
          section.content.title ??
          section.content.brand ??
          section.sectionType
      ).slice(0, 54);

      return node(
        section.id,
        `${section.sectionType}: ${label}`,
        "Editable canvas section",
        90 + index * 220,
        420 + (index % 2) * 115,
        {
          sectionId: section.id,
          elementId: primaryElementId(section.sectionType, number)
        }
      );
    });
    const strategy = strategyNodes(projectName, sections);
    const strategyEdges: Edge[] = [
      ["audience", "offer"],
      ["offer", "proof"],
      ["proof", "cta"],
      ["offer", "objections"],
      ["objections", "cta"],
      ["cta", "growth"]
    ].map(([source, target]) => ({
      id: `${source}-${target}`,
      source,
      target,
      animated: true,
      style: { stroke: "#EF9F27" }
    }));
    const sectionEdges: Edge[] = sectionNodes.slice(0, -1).map((current, index) => ({
      id: `${current.id}-${sectionNodes[index + 1].id}`,
      source: current.id,
      target: sectionNodes[index + 1].id,
      animated: false,
      style: { stroke: "rgba(237,237,237,0.2)" }
    }));

    if (view === "flow") {
      return { nodes: sectionNodes, edges: sectionEdges };
    }

    return { nodes: [...strategy, ...sectionNodes], edges: [...strategyEdges, ...sectionEdges] };
  }, [projectName, sections, view]);

  const handleNodeClick: NodeMouseHandler<Node<PitchNodeData>> = (_event, clickedNode) => {
    setActiveNode(clickedNode);
    setDraftLabel(clickedNode.data.label.replace(/^[A-Z_]+:\s*/, ""));

    if (clickedNode.data.elementId) {
      setSelectedElementId(clickedNode.data.elementId);
      setSelectedElements([clickedNode.data.elementId]);
      addLog(`[MAP]: Selected ${clickedNode.data.elementId}.`);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeNode?.data.elementId || !draftLabel.trim()) {
      return;
    }

    updateElementContent(activeNode.data.elementId, draftLabel.trim());
    addLog(`[MAP]: Updated ${activeNode.data.elementId}.`);
  };

  if (!open) {
    return null;
  }

  return (
    <aside className="absolute bottom-0 left-0 top-12 z-50 grid w-[min(980px,calc(100vw-220px))] grid-cols-[1fr_260px] border-r border-terminalBorder bg-ink/98 text-bone backdrop-blur-xl">
      <section className="min-w-0 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-amber">
              Pitch Map
            </h2>
            <p className="mt-1 text-[11px] text-white/42">
              Audience, offer, proof, CTA, objections, and first growth moves.
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
        <div className="mb-3 flex gap-2">
          {(["strategy", "flow"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className="h-8 border px-3 text-[11px] font-bold uppercase tracking-[0.12em] transition"
              style={{
                borderColor: view === option ? "#EF9F27" : "#1A1A1A",
                color: view === option ? "#EF9F27" : "rgba(255,255,255,0.55)"
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="h-[calc(100%-56px)] border border-terminalBorder bg-[#050505]">
          {sections.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-white/38">
              Generate a page to build the founder strategy.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              colorMode="dark"
              onNodeClick={handleNodeClick}
            >
              <Background color="#1A1A1A" gap={32} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>
      </section>
      <section className="border-l border-terminalBorder p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
          Specificity
        </h3>
        {activeNode?.data.elementId ? (
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            <p className="text-[11px] leading-relaxed text-white/42">
              Editing <span className="text-amber">{activeNode.data.elementId}</span>.
              This writes back to the canvas state, so undo, redo, autosave, and publish
              all see the change.
            </p>
            <textarea
              value={draftLabel}
              onChange={(event) => setDraftLabel(event.target.value)}
              className="min-h-28 resize-none border border-terminalBorder bg-black/50 p-3 text-xs text-bone outline-none focus:border-amber"
            />
            <button
              type="submit"
              className="h-9 border border-amber/70 bg-amber px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink transition hover:bg-signalAmber"
            >
              Apply Edit
            </button>
            {activeNode.data.sectionId ? (
              <button
                type="button"
                onClick={() => {
                  removeSection(activeNode.data.sectionId!);
                  setActiveNode(null);
                  setDraftLabel("");
                }}
                className="h-9 border border-red-500/40 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-red-200 transition hover:border-red-400"
              >
                Delete Section
              </button>
            ) : null}
          </form>
        ) : (
          <div className="mt-4 grid gap-3 text-[11px] leading-relaxed text-white/42">
            <p>Click any section node to select and edit its canvas text.</p>
            <p>Use strategy nodes to check buyer, offer, proof, CTA, objection handling, and growth path.</p>
            <p>Voice edits still work after selection: say “make this sharper” or “change this to Coca.”</p>
          </div>
        )}
      </section>
    </aside>
  );
}
