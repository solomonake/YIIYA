"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps
} from "@xyflow/react";
import { type FormEvent, useMemo, useState } from "react";
import {
  useYiiyaStore,
  type SceneObject,
  type YiiyaSection
} from "@/lib/store";
import type { CreativeBrief } from "@/lib/creative-brief";

type MapView = "strategy" | "flow";

type NodeStatus = "strong" | "needs-input" | "missing";

type PitchNodeData = {
  label: string;
  subtitle: string;
  eyebrow: string;
  detail?: string;
  kind:
    | "spine"
    | "section"
    | "gap"
    | "objection"
    | "growth"
    | "spatial"
    | "question";
  status: NodeStatus;
  score?: number;
  metricLabel?: string;
  elementId?: string;
  sectionId?: string;
};

type MapDiagnostic = {
  id: string;
  label: string;
  detail: string;
  status: NodeStatus;
  elementId?: string;
};

type StrategyModel = {
  nodes: Node<PitchNodeData>[];
  edges: Edge[];
  diagnostics: MapDiagnostic[];
  questions: MapDiagnostic[];
  confidenceScore: number;
  gapCount: number;
};

const nodeTypes = {
  strategyNode: StrategyNode
};

function statusColor(status: NodeStatus) {
  if (status === "strong") {
    return "#58D68D";
  }

  if (status === "needs-input") {
    return "#EF9F27";
  }

  return "#FF6B6B";
}

function statusLabel(status: NodeStatus) {
  if (status === "strong") {
    return "Ready";
  }

  if (status === "needs-input") {
    return "Tighten";
  }

  return "Gap";
}

function StrategyNode({ data, selected }: NodeProps<Node<PitchNodeData>>) {
  const status = statusColor(data.status);
  const isSection = data.kind === "section";

  return (
    <div
      className="group relative overflow-hidden border bg-[#070707]/98 text-bone shadow-[0_18px_50px_rgba(0,0,0,0.42)] transition"
      style={{
        width: isSection ? 238 : 250,
        borderColor: selected ? "#EF9F27" : "rgba(237,237,237,0.14)",
        borderRadius: 7
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0"
        style={{ background: status }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0"
        style={{ background: status }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            data.status === "strong"
              ? "linear-gradient(90deg, transparent, rgba(88,214,141,0.8), transparent)"
              : data.status === "needs-input"
                ? "linear-gradient(90deg, transparent, rgba(239,159,39,0.8), transparent)"
                : "linear-gradient(90deg, transparent, rgba(255,107,107,0.8), transparent)"
        }}
      />
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/36">
            {data.eyebrow}
          </span>
          <span
            className="rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
            style={{
              borderColor: `${status}66`,
              color: status,
              background: `${status}12`
            }}
          >
            {statusLabel(data.status)}
          </span>
        </div>
        <h4 className="text-[12px] font-black uppercase leading-snug tracking-[0.08em] text-white">
          {data.label}
        </h4>
        <p className="mt-2 min-h-10 text-[11px] leading-relaxed text-white/58">
          {data.subtitle}
        </p>
        {data.detail ? (
          <p className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/42">
            {data.detail}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          {typeof data.score === "number" ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(8, Math.min(100, data.score))}%`,
                    background: status
                  }}
                />
              </span>
              <span className="text-[10px] font-bold text-white/50">{data.score}%</span>
            </div>
          ) : (
            <span className="text-[10px] text-white/28">Map node</span>
          )}
          <span className="text-[10px] text-white/35">
            {data.metricLabel ?? "Inspect"}
          </span>
        </div>
      </div>
    </div>
  );
}

function primaryElementId(sectionType: string, index: number) {
  const lower = sectionType.toLowerCase();

  if (sectionType === "NAVBAR") {
    return `navbar-brand-${index}`;
  }

  if (sectionType === "FOOTER") {
    return `footer-brand-${index}`;
  }

  if (sectionType === "CONTACT") {
    return `contact-cta-${index}`;
  }

  return `${lower}-title-${index}`;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);

      if (found) {
        return found;
      }
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const priorityKeys = [
      "heading",
      "title",
      "label",
      "quote",
      "name",
      "description",
      "subtext",
      "text"
    ];

    for (const key of priorityKeys) {
      const found = firstString(record[key]);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function sectionText(section: YiiyaSection | undefined, keys: string[]) {
  if (!section) {
    return null;
  }

  for (const key of keys) {
    const value = firstString(section.content[key]);

    if (value) {
      return value;
    }
  }

  return firstString(section.content);
}

function sectionByType(sections: YiiyaSection[], types: YiiyaSection["sectionType"][]) {
  return sections.find((section) => types.includes(section.sectionType));
}

function hasUsefulText(value: string | null | undefined, minimum = 28) {
  return Boolean(value && value.trim().length >= minimum);
}

function statusFromScore(score: number): NodeStatus {
  if (score >= 76) {
    return "strong";
  }

  if (score >= 45) {
    return "needs-input";
  }

  return "missing";
}

function clipped(value: string, limit = 92) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, limit - 3)}...`;
}

function makeNode(
  id: string,
  data: PitchNodeData,
  x: number,
  y: number
): Node<PitchNodeData> {
  return {
    id,
    type: "strategyNode",
    position: { x, y },
    data
  };
}

function diagnosticNode(diagnostic: MapDiagnostic, index: number): Node<PitchNodeData> {
  return makeNode(
    diagnostic.id,
    {
      label: diagnostic.label,
      eyebrow: `Brief question ${index + 1}`,
      subtitle: diagnostic.detail,
      detail: "Answer before generation to reduce unwanted edits later.",
      kind: "question",
      status: diagnostic.status,
      score: diagnostic.status === "strong" ? 86 : diagnostic.status === "needs-input" ? 52 : 24,
      metricLabel: diagnostic.status === "strong" ? "answered" : "ask user"
    },
    20 + index * 310,
    -95
  );
}

function makeEdge(
  source: string,
  target: string,
  label?: string,
  tone: "primary" | "muted" | "risk" | "growth" = "primary"
): Edge {
  const colors = {
    primary: "#EF9F27",
    muted: "rgba(237,237,237,0.22)",
    risk: "#FF6B6B",
    growth: "#58D68D"
  };
  const color = colors[tone];

  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
    animated: tone === "primary",
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: {
      stroke: color,
      strokeWidth: tone === "muted" ? 1 : 1.6
    },
    labelStyle: {
      fill: "rgba(237,237,237,0.5)",
      fontSize: 10,
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      letterSpacing: 0
    },
    labelBgStyle: {
      fill: "#050505",
      fillOpacity: 0.86
    }
  };
}

function sectionEditableData(section: YiiyaSection | undefined, sections: YiiyaSection[]) {
  if (!section) {
    return {};
  }

  return {
    sectionId: section.id,
    elementId: primaryElementId(section.sectionType, sections.indexOf(section) + 1)
  };
}

function buildDiagnostics({
  audienceText,
  offerText,
  proofText,
  ctaText,
  hasFaq,
  hasPricing,
  sceneObjects,
  activeBrief
}: {
  audienceText: string | null;
  offerText: string | null;
  proofText: string | null;
  ctaText: string | null;
  hasFaq: boolean;
  hasPricing: boolean;
  sceneObjects: SceneObject[];
  activeBrief: CreativeBrief | null;
}) {
  const diagnostics: MapDiagnostic[] = [
    {
      id: "diag-audience",
      label: "Audience precision",
      detail: hasUsefulText(audienceText)
        ? clipped(audienceText ?? "")
        : "Name the buyer, their context, and the trigger that makes them care now.",
      status: hasUsefulText(audienceText) ? "strong" : "needs-input"
    },
    {
      id: "diag-offer",
      label: "Offer clarity",
      detail: hasUsefulText(offerText)
        ? clipped(offerText ?? "")
        : "The map needs one concrete promise, not a vibe or category.",
      status: hasUsefulText(offerText) ? "strong" : "missing"
    },
    {
      id: "diag-proof",
      label: "Proof density",
      detail: hasUsefulText(proofText, 18)
        ? clipped(proofText ?? "")
        : "Add proof: numbers, testimonials, demos, process, logos, reviews, or material evidence.",
      status: hasUsefulText(proofText, 18) ? "strong" : "missing"
    },
    {
      id: "diag-cta",
      label: "Next step",
      detail: hasUsefulText(ctaText, 8)
        ? clipped(ctaText ?? "")
        : "The visitor needs one visible, specific action.",
      status: hasUsefulText(ctaText, 8) ? "strong" : "needs-input"
    },
    {
      id: "diag-objections",
      label: "Objection handling",
      detail: hasFaq || hasPricing
        ? "FAQ or pricing structure exists, so hesitation has somewhere to land."
        : "Cover price, timing, trust, fit, and switching cost before the CTA.",
      status: hasFaq || hasPricing ? "strong" : "needs-input"
    },
    {
      id: "diag-spatial",
      label: "Spatial anchor",
      detail: sceneObjects.length > 0
        ? `${sceneObjects.length} object${sceneObjects.length === 1 ? "" : "s"} available for circle + voice refinement.`
        : "Add one hero object so users can circle it while speaking and reshape the outcome.",
      status: sceneObjects.length > 0 ? "strong" : "needs-input"
    },
    {
      id: "diag-compiler",
      label: "Compiler confidence",
      detail: activeBrief
        ? `${Math.round(activeBrief.confidence * 100)}% ${activeBrief.archetype.replace("-", " ")} path via ${activeBrief.fallbackPath}.`
        : "No active brief captured yet. Generate or refine once with strategy mode on.",
      status: activeBrief && activeBrief.confidence >= 0.72 ? "strong" : "needs-input"
    }
  ];

  const questions: MapDiagnostic[] = [
    {
      id: "question-audience",
      label: "Who exactly is this for?",
      detail: "Role, situation, urgency, and why they would switch from their current option.",
      status: hasUsefulText(audienceText) ? "strong" : "needs-input"
    },
    {
      id: "question-offer",
      label: "What outcome are they buying?",
      detail: "A transformation, deliverable, or product value that can be understood in one scan.",
      status: hasUsefulText(offerText) ? "strong" : "missing"
    },
    {
      id: "question-proof",
      label: "What makes it believable?",
      detail: "Use receipts: work samples, metrics, reviews, process, guarantees, or founder authority.",
      status: hasUsefulText(proofText, 18) ? "strong" : "missing"
    },
    {
      id: "question-cta",
      label: "What should they do next?",
      detail: "One action with a clear payoff: book, buy, join, view, call, download, or request.",
      status: hasUsefulText(ctaText, 8) ? "strong" : "needs-input"
    }
  ];

  return { diagnostics, questions };
}

function buildStrategyModel({
  projectName,
  sections,
  sceneObjects,
  activeBrief,
  referenceImage,
  view
}: {
  projectName: string;
  sections: YiiyaSection[];
  sceneObjects: SceneObject[];
  activeBrief: CreativeBrief | null;
  referenceImage: { name: string; dominantColor?: string; accentCandidate?: string } | null;
  view: MapView;
}): StrategyModel {
  const hero = sectionByType(sections, ["HERO"]);
  const offer = sectionByType(sections, ["SERVICES", "FEATURES", "PRICING", "ABOUT"]);
  const proof = sectionByType(sections, ["TESTIMONIALS", "METRICS", "LOGO_STRIP"]);
  const contact = sectionByType(sections, ["CONTACT"]);
  const faq = sectionByType(sections, ["FAQ"]);
  const pricing = sectionByType(sections, ["PRICING"]);
  const heroText = sectionText(hero, ["heading", "title", "subtext", "description"]);
  const audienceText = activeBrief?.audience ?? sectionText(hero, ["subtext", "description"]);
  const offerText = sectionText(offer, ["heading", "title", "subtext", "description"]);
  const proofText =
    sectionText(proof, ["heading", "title", "quote", "subtext", "description"]) ??
    activeBrief?.proofPoints.join(", ") ??
    null;
  const ctaText =
    sectionText(contact, ["cta", "heading", "title"]) ??
    sectionText(hero, ["cta", "submit"]) ??
    activeBrief?.cta ??
    null;
  const spatialSummary =
    sceneObjects[0]?.resolvedName ??
    sceneObjects[0]?.prompt ??
    activeBrief?.spatialAssetFamily ??
    "hero object";
  const audienceScore = activeBrief?.confidence
    ? Math.round(activeBrief.confidence * 100)
    : hasUsefulText(audienceText)
      ? 72
      : 42;
  const offerScore = hasUsefulText(offerText) ? 78 : hasUsefulText(heroText) ? 56 : 30;
  const proofScore = hasUsefulText(proofText, 18) ? 76 : 28;
  const ctaScore = hasUsefulText(ctaText, 8) ? 82 : 45;
  const objectionScore = faq || pricing ? 74 : 46;
  const growthScore = sections.length >= 5 && hasUsefulText(ctaText, 8) ? 70 : 44;
  const spatialScore = sceneObjects.length > 0 ? 82 : referenceImage ? 64 : 38;
  const { diagnostics, questions } = buildDiagnostics({
    audienceText,
    offerText,
    proofText,
    ctaText,
    hasFaq: Boolean(faq),
    hasPricing: Boolean(pricing),
    sceneObjects,
    activeBrief
  });
  const gapCount = diagnostics.filter((item) => item.status !== "strong").length;
  const confidenceScore = Math.round(
    (audienceScore +
      offerScore +
      proofScore +
      ctaScore +
      objectionScore +
      growthScore +
      spatialScore) /
      7
  );

  const strategyNodes = [
    makeNode(
      "audience",
      {
        label: "Audience",
        eyebrow: "01 / Demand",
        subtitle: clipped(
          audienceText ??
            `Define who ${projectName} must win before the first scroll.`,
          86
        ),
        detail: activeBrief
          ? `${activeBrief.archetype.replace("-", " ")} intent, ${activeBrief.visualTone}.`
          : "Answer the buyer before changing visuals.",
        kind: "spine",
        status: statusFromScore(audienceScore),
        score: audienceScore,
        metricLabel: "buyer"
      },
      20,
      115
    ),
    makeNode(
      "offer",
      {
        label: "Offer",
        eyebrow: "02 / Promise",
        subtitle: clipped(offerText ?? "Make the main promise concrete and visible.", 86),
        detail: "This is the product's one-sentence value contract.",
        kind: "spine",
        status: statusFromScore(offerScore),
        score: offerScore,
        metricLabel: "promise",
        ...sectionEditableData(offer, sections)
      },
      330,
      115
    ),
    makeNode(
      "proof",
      {
        label: "Proof",
        eyebrow: "03 / Belief",
        subtitle: clipped(
          proofText ?? "Add trust, receipts, examples, numbers, or process evidence.",
          86
        ),
        detail: activeBrief?.proofPoints.length
          ? clipped(activeBrief.proofPoints.join(" / "), 92)
          : "Proof turns a generated page into a credible offer.",
        kind: "spine",
        status: statusFromScore(proofScore),
        score: proofScore,
        metricLabel: "belief",
        ...sectionEditableData(proof, sections)
      },
      640,
      115
    ),
    makeNode(
      "cta",
      {
        label: "CTA",
        eyebrow: "04 / Conversion",
        subtitle: clipped(ctaText ?? "Give the visitor one obvious next action.", 86),
        detail: "The CTA should complete the audience-offer-proof chain.",
        kind: "spine",
        status: statusFromScore(ctaScore),
        score: ctaScore,
        metricLabel: "action",
        ...sectionEditableData(contact ?? hero, sections)
      },
      950,
      115
    ),
    makeNode(
      "objections",
      {
        label: "Objections",
        eyebrow: "Risk lane",
        subtitle: faq || pricing
          ? "Hesitation is covered by FAQ or pricing structure."
          : "Cover price, trust, timeline, switching cost, and fit before the CTA.",
        detail: "Best pages remove doubt before the user has to ask.",
        kind: "objection",
        status: statusFromScore(objectionScore),
        score: objectionScore,
        metricLabel: faq ? "FAQ" : pricing ? "pricing" : "open"
      },
      485,
      335
    ),
    makeNode(
      "growth",
      {
        label: "Growth moves",
        eyebrow: "Distribution",
        subtitle: "Capture demand, retarget interest, publish proof, then iterate the hook.",
        detail: sections.length >= 5
          ? "The page has enough structure for launch tests."
          : "Build enough sections to test traffic, not just a hero.",
        kind: "growth",
        status: statusFromScore(growthScore),
        score: growthScore,
        metricLabel: "launch loop"
      },
      790,
      335
    ),
    makeNode(
      "spatial-loop",
      {
        label: "Circle + voice loop",
        eyebrow: "Spatial control",
        subtitle: sceneObjects.length > 0
          ? `Use speech and selection to refine ${clipped(spatialSummary, 46)}.`
          : "Add one hero object so the user can circle it while speaking.",
        detail: referenceImage
          ? `Reference loaded: ${referenceImage.name}.`
          : "This keeps web generation tactile instead of prompt-only.",
        kind: "spatial",
        status: statusFromScore(spatialScore),
        score: spatialScore,
        metricLabel: sceneObjects.length > 0 ? "object ready" : "needs object"
      },
      170,
      335
    )
  ];

  const questionNodes = questions.map(diagnosticNode);

  const sectionNodes = sections.slice(0, 10).map((section, index) => {
    const number = index + 1;
    const label = clipped(
      sectionText(section, ["heading", "title", "brand", "cta"]) ?? section.sectionType,
      58
    );
    const isConversionSection = ["HERO", "SERVICES", "FEATURES", "PRICING", "CONTACT"].includes(
      section.sectionType
    );

    return makeNode(
      section.id,
      {
        label,
        eyebrow: `${String(number).padStart(2, "0")} / ${section.sectionType}`,
        subtitle: isConversionSection
          ? "Conversion surface linked to the generated page."
          : "Support section in the generated page flow.",
        detail: clipped(section.layoutVariant ?? "Canvas section", 60),
        kind: "section",
        status: isConversionSection ? "strong" : "needs-input",
        score: isConversionSection ? 74 : 58,
        metricLabel: "canvas",
        sectionId: section.id,
        elementId: primaryElementId(section.sectionType, number)
      },
      view === "flow" ? 30 + index * 290 : 70 + index * 260,
      view === "flow" ? 145 + (index % 2) * 150 : 575 + (index % 2) * 120
    );
  });

  const gapNodes = diagnostics
    .filter((diagnostic) => diagnostic.status !== "strong")
    .slice(0, 4)
    .map((diagnostic, index) =>
      makeNode(
        diagnostic.id,
        {
          label: diagnostic.label,
          eyebrow: "Gap",
          subtitle: diagnostic.detail,
          detail: "Resolve this before calling the page launch-ready.",
          kind: "gap",
          status: diagnostic.status,
          score: diagnostic.status === "needs-input" ? 48 : 18,
          metricLabel: "fix next",
          elementId: diagnostic.elementId
        },
        1110,
        315 + index * 150
      )
    );

  const strategyEdges = [
    makeEdge("audience", "offer", "problem fit"),
    makeEdge("offer", "proof", "belief"),
    makeEdge("proof", "cta", "conversion"),
    makeEdge("offer", "objections", "hesitation", "risk"),
    makeEdge("objections", "cta", "resolve", "risk"),
    makeEdge("cta", "growth", "launch loop", "growth"),
    makeEdge("spatial-loop", "offer", "object changes page"),
    makeEdge("spatial-loop", "proof", "show don't tell", "muted")
  ];

  const questionEdges = questions.map((question, index) =>
    makeEdge(question.id, ["audience", "offer", "proof", "cta"][index], "answers", "muted")
  );
  const sectionEdges = sectionNodes.slice(0, -1).map((current, index) =>
    makeEdge(current.id, sectionNodes[index + 1].id, undefined, "muted")
  );
  const gapEdges = gapNodes.map((gap) =>
    makeEdge(
      gap.id,
      gap.id.includes("offer")
        ? "offer"
        : gap.id.includes("proof")
          ? "proof"
          : gap.id.includes("cta")
            ? "cta"
            : "audience",
      "pressure",
      "risk"
    )
  );

  if (view === "flow") {
    return {
      nodes: sectionNodes,
      edges: sectionEdges,
      diagnostics,
      questions,
      confidenceScore,
      gapCount
    };
  }

  return {
    nodes: [...questionNodes, ...strategyNodes, ...sectionNodes, ...gapNodes],
    edges: [...questionEdges, ...strategyEdges, ...sectionEdges, ...gapEdges],
    diagnostics,
    questions,
    confidenceScore,
    gapCount
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
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const projectName = useYiiyaStore((state) => state.projectName);
  const activeBrief = useYiiyaStore((state) => state.activeBrief);
  const referenceImage = useYiiyaStore((state) => state.referenceImage);
  const setSelectedElementId = useYiiyaStore((state) => state.setSelectedElementId);
  const setSelectedElements = useYiiyaStore((state) => state.setSelectedElements);
  const updateElementContent = useYiiyaStore((state) => state.updateElementContent);
  const removeSection = useYiiyaStore((state) => state.removeSection);
  const addLog = useYiiyaStore((state) => state.addLog);
  const [activeNode, setActiveNode] = useState<Node<PitchNodeData> | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [view, setView] = useState<MapView>("strategy");

  const model = useMemo(
    () =>
      buildStrategyModel({
        projectName,
        sections,
        sceneObjects,
        activeBrief,
        referenceImage,
        view
      }),
    [activeBrief, projectName, referenceImage, sceneObjects, sections, view]
  );

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
    <aside className="absolute bottom-0 left-0 top-12 z-50 grid w-[min(1180px,calc(100vw-96px))] grid-cols-[1fr_316px] border-r border-terminalBorder bg-[#030303]/98 text-bone shadow-[30px_0_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <section className="min-w-0 p-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber">
              Strategy Map
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/45">
              Plan the generated outcome as a conversion system: audience, offer, proof,
              CTA, objections, growth moves, and the circle + voice object loop.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden border border-white/10 bg-white/[0.03] px-3 py-2 text-right sm:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/32">
                Confidence
              </p>
              <p className="text-sm font-black text-white">{model.confidenceScore}%</p>
            </div>
            <div className="hidden border border-white/10 bg-white/[0.03] px-3 py-2 text-right sm:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/32">
                Gaps
              </p>
              <p className="text-sm font-black text-amber">{model.gapCount}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 border border-terminalBorder px-3 text-[11px] uppercase tracking-[0.12em] text-white/55 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
            >
              Close
            </button>
          </div>
        </div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {(["strategy", "flow"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className="h-8 border px-3 text-[11px] font-bold uppercase tracking-[0.12em] transition"
                style={{
                  borderColor: view === option ? "#EF9F27" : "#1A1A1A",
                  background: view === option ? "rgba(239,159,39,0.12)" : "transparent",
                  color: view === option ? "#EF9F27" : "rgba(255,255,255,0.55)"
                }}
              >
                {option === "strategy" ? "Strategy" : "Page Flow"}
              </button>
            ))}
          </div>
          <p className="hidden text-[10px] uppercase tracking-[0.16em] text-white/28 lg:block">
            Conversion canvas / live section links
          </p>
        </div>
        <div className="h-[calc(100%-88px)] overflow-hidden border border-terminalBorder bg-[#050505]">
          {sections.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber">
                  Generate first
                </p>
                <p className="mt-2 max-w-md text-[12px] leading-relaxed text-white/42">
                  The map becomes useful after the compiler has sections, a brief, or a
                  spatial object to inspect.
                </p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={model.nodes}
              edges={model.edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.35}
              maxZoom={1.35}
              colorMode="dark"
              onNodeClick={handleNodeClick}
              defaultEdgeOptions={{
                interactionWidth: 18
              }}
            >
              <Background color="#1A1A1A" gap={28} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>
      </section>
      <section className="min-w-0 border-l border-terminalBorder bg-black/24 p-4">
        <div className="border-b border-white/10 pb-4">
          <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white/48">
            Map Inspector
          </h3>
          <p className="mt-2 text-[11px] leading-relaxed text-white/38">
            Buyer path, section evidence, unresolved launch gaps.
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          {model.questions.map((question, index) => (
            <button
              key={question.id}
              type="button"
              className="border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-amber/50 hover:bg-amber/[0.06]"
              onClick={() =>
                setActiveNode(
                  model.nodes.find((candidate) => candidate.id === question.id) ??
                    diagnosticNode(question, index)
                )
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                  Question {index + 1}
                </span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: statusColor(question.status) }}
                />
              </div>
              <p className="mt-1 text-[11px] font-bold leading-snug text-white/78">
                {question.label}
              </p>
            </button>
          ))}
        </div>

        {activeNode?.data.elementId ? (
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            <div className="border border-amber/25 bg-amber/[0.06] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">
                Editing canvas
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-white/48">
                Target: <span className="text-amber">{activeNode.data.elementId}</span>.
                This writes back to the store, so undo, redo, autosave, publish, and
                voice refinement see the change.
              </p>
            </div>
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
        ) : activeNode ? (
          <div className="mt-4 border border-white/10 bg-white/[0.025] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/36">
              {activeNode.data.eyebrow}
            </p>
            <h4 className="mt-2 text-sm font-black uppercase tracking-[0.08em] text-white">
              {activeNode.data.label}
            </h4>
            <p className="mt-2 text-[11px] leading-relaxed text-white/50">
              {activeNode.data.subtitle}
            </p>
            {activeNode.data.detail ? (
              <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/38">
                {activeNode.data.detail}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 text-[11px] leading-relaxed text-white/42">
            <p>
              Select a strategy, gap, or section node. Section-linked nodes keep voice
              refinement active for commands like make this sharper or change this to Coca.
            </p>
          </div>
        )}

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
            Gaps to solve
          </p>
          <div className="mt-3 grid gap-2">
            {model.diagnostics
              .filter((diagnostic) => diagnostic.status !== "strong")
              .slice(0, 4)
              .map((diagnostic) => (
                <div key={diagnostic.id} className="border border-white/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold text-white/72">{diagnostic.label}</p>
                    <span
                      className="text-[9px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: statusColor(diagnostic.status) }}
                    >
                      {statusLabel(diagnostic.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/38">
                    {diagnostic.detail}
                  </p>
                </div>
              ))}
            {model.gapCount === 0 ? (
              <div className="border border-emerald-400/25 bg-emerald-400/[0.06] p-3 text-[11px] leading-relaxed text-emerald-100/72">
                No major map gaps detected. The next review should focus on visual
                taste, responsiveness, and whether the spatial object supports the offer.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </aside>
  );
}
