import type {
  AssetBrief,
  AssetDestination,
  AssetExportFormat,
  AssetLane,
  AssetPlan,
  RoutePlan
} from "@/lib/asset-compiler";
import type { ScanJobSummary } from "@/lib/scan-types";

type AssetReadinessCheck = AssetBrief["readiness"]["checks"][number];

export type AssetJobState =
  | "queued"
  | "planning"
  | "previewing"
  | "finalizing"
  | "validating"
  | "packaging"
  | "complete"
  | "failed";

export type AssetJobPhase =
  | "summary"
  | "route_plan"
  | "preview"
  | "repair"
  | "validation"
  | "package"
  | "handoff";

export type AssetArtifact = {
  id: string;
  label: string;
  kind:
    | "preview"
    | "final"
    | "cadquery"
    | "step"
    | "stl"
    | "report"
    | "manifest"
    | "export"
    | "source-pack";
  format: AssetExportFormat;
  mimeType: string;
  status: "ready" | "pending" | "failed";
  url?: string;
  inlineText?: string;
  inlineJson?: unknown;
  inlineBase64?: string;
  fileName: string;
};

export type AssetValidationCheck = {
  label: string;
  status: "ready" | "needs-work" | "planned" | "failed";
  detail?: string;
};

export type AssetJob = {
  id: string;
  lane: AssetLane;
  destination: AssetDestination;
  state: AssetJobState;
  phase: AssetJobPhase;
  progress: number;
  summary: AssetPlan["summary"];
  brief: AssetBrief;
  routePlan: RoutePlan;
  inputs: {
    prompt: string;
    sourceKind: AssetBrief["sourceKind"];
    referenceImage?: boolean;
    scanId?: string | null;
  };
  artifacts: AssetArtifact[];
  validation: AssetValidationCheck[];
  handoff: {
    headline: string;
    notes: string[];
  };
  warnings: string[];
  error?: string | null;
  provider?: string | null;
  createdAt: string;
  updatedAt: string;
};

type AssetJobPatch = Partial<Omit<AssetJob, "id" | "createdAt" | "updatedAt">>;

function store() {
  const scope = globalThis as typeof globalThis & {
    __yiiyaAssetJobs?: Map<string, AssetJob>;
  };

  if (!scope.__yiiyaAssetJobs) {
    scope.__yiiyaAssetJobs = new Map();
  }

  return scope.__yiiyaAssetJobs;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function labelStage(stage: string) {
  return stage.replaceAll("_", " ");
}

function scanHandoffNotes(scanJob: ScanJobSummary) {
  const notes: string[] = [];

  if (scanJob.repairSummary?.usedFallbackMesh) {
    notes.push("Preview/final mesh came from the single-image fallback path, not a full multi-view solve.");
  }

  for (const report of scanJob.stageReports) {
    if (report.status === "fallback" || report.status === "deferred" || report.status === "failed") {
      notes.push(`${labelStage(report.stage)}: ${report.detail ?? report.status}.`);
    }
  }

  for (const warning of scanJob.warnings) {
    notes.push(warning.label);
  }

  return Array.from(new Set(notes)).slice(0, 6);
}

export function createAssetJob(plan: AssetPlan, prompt: string, input?: { scanId?: string | null }) {
  const id = createId("assetjob");
  const createdAt = nowIso();
  const job: AssetJob = {
    id,
    lane: plan.brief.lane,
    destination: plan.brief.destination,
    state: "planning",
    phase: "summary",
    progress: 0.08,
    summary: plan.summary,
    brief: plan.brief,
    routePlan: plan.routePlan,
    inputs: {
      prompt,
      sourceKind: plan.brief.sourceKind,
      referenceImage: plan.brief.sourceKind === "image" || plan.brief.sourceKind === "mixed",
      scanId: input?.scanId ?? null
    },
    artifacts: [],
    validation: plan.brief.readiness.checks.map((check: AssetReadinessCheck) => ({
      label: check.label,
      status: check.status,
      detail: check.detail
    })),
    handoff: {
      headline: plan.summary.userVisible,
      notes: []
    },
    warnings: [...plan.summary.warnings],
    error: null,
    provider: null,
    createdAt,
    updatedAt: createdAt
  };

  store().set(id, job);
  return job;
}

export function getAssetJob(id: string) {
  return store().get(id) ?? null;
}

export function listAssetJobs() {
  return Array.from(store().values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateAssetJob(id: string, patch: AssetJobPatch) {
  const current = getAssetJob(id);
  if (!current) {
    return null;
  }

  const next: AssetJob = {
    ...current,
    ...patch,
    handoff: patch.handoff ? { ...current.handoff, ...patch.handoff } : current.handoff,
    inputs: patch.inputs ? { ...current.inputs, ...patch.inputs } : current.inputs,
    updatedAt: nowIso()
  };

  store().set(id, next);
  return next;
}

export function replaceAssetArtifacts(id: string, artifacts: AssetArtifact[]) {
  return updateAssetJob(id, { artifacts });
}

export function addAssetArtifacts(id: string, artifacts: AssetArtifact[]) {
  const current = getAssetJob(id);
  if (!current) {
    return null;
  }

  const deduped = [
    ...current.artifacts.filter(
      (artifact) => !artifacts.some((incoming) => incoming.id === artifact.id)
    ),
    ...artifacts
  ];

  return updateAssetJob(id, { artifacts: deduped });
}

export function syncAssetJobFromScan(scanJob: ScanJobSummary) {
  const existing =
    listAssetJobs().find((job) => job.inputs.scanId === scanJob.id) ?? null;

  const artifacts: AssetArtifact[] = [
    ...scanJob.exports.map(
      (item): AssetArtifact => ({
        id: item.id,
        label: `${item.tier} ${item.format.toUpperCase()}`,
        kind: item.tier === "source-pack" ? "source-pack" : "export",
        format: item.format,
        mimeType:
          item.format === "zip"
            ? "application/zip"
            : item.format === "stl"
              ? "model/stl"
              : item.format === "obj"
                ? "model/obj"
                : "model/gltf-binary",
        status: item.status === "failed" ? "failed" : item.status === "ready" ? "ready" : "pending",
        url: item.url,
        fileName: item.fileName
      }),
    ),
    ...scanJob.assets
      .filter(
        (asset) =>
          asset.kind === "preview-mesh" ||
          asset.kind === "mesh" ||
          asset.kind === "textured-mesh",
      )
      .map(
        (asset): AssetArtifact => ({
          id: asset.id,
          label: asset.label,
          kind: asset.kind === "preview-mesh" ? "preview" : "final",
          format: asset.fileName.toLowerCase().endsWith(".obj") ? "obj" : "glb",
          mimeType: asset.mimeType,
          status: "ready",
          url: asset.url,
          fileName: asset.fileName
        }),
      ),
    ...scanJob.assets
      .filter(
        (asset) => asset.kind === "metadata" && asset.fileName.toLowerCase().endsWith(".json"),
      )
      .map(
        (asset): AssetArtifact => ({
          id: asset.id,
          label: asset.label,
          kind: asset.fileName.toLowerCase().includes("manifest") ? "manifest" : "report",
          format: "json",
          mimeType: asset.mimeType,
          status: "ready",
          url: asset.url,
          fileName: asset.fileName
        }),
      )
  ];

  const validation: AssetValidationCheck[] = [
    {
      label: "Capture coverage",
      status: scanJob.captureStatus === "uploaded" ? "ready" : "needs-work",
      detail: `${Math.round(scanJob.progress * 100)}% pipeline progress`
    },
    {
      label: "Reconstruction",
      status: scanJob.state === "failed" ? "failed" : scanJob.state === "complete" ? "ready" : "planned",
      detail: scanJob.stage
    },
    {
      label: "Export package",
      status: scanJob.exports.some((item) => item.status === "ready") ? "ready" : "planned"
    },
    {
      label: "Repair log",
      status: scanJob.stageReports.length > 0 ? "ready" : "planned",
      detail:
        scanJob.repairSummary?.usedFallbackMesh
          ? "Fallback path is documented for downstream cleanup."
          : scanJob.stageReports.length > 0
            ? "Structured stage notes are available."
            : undefined
    }
  ];

  const patch: AssetJobPatch = {
    lane: "scan",
    destination: existing?.destination ?? "portfolio",
    state:
      scanJob.state === "failed"
        ? "failed"
        : scanJob.state === "complete"
          ? "complete"
          : scanJob.state === "packaging"
            ? "packaging"
            : "previewing",
    phase:
      scanJob.state === "complete"
        ? "handoff"
        : scanJob.state === "packaging"
          ? "package"
          : "preview",
    progress: scanJob.progress,
    artifacts,
    validation,
    warnings: scanJob.warnings.map((warning) => warning.label),
    error: scanJob.lastError ?? null,
    provider: scanJob.worker ?? null,
    handoff: {
      headline: scanJob.objectHint ?? scanJob.promptHint ?? "Scan reconstruction",
      notes: scanHandoffNotes(scanJob)
    }
  };

  if (!existing) {
    const created = createAssetJob(
      {
        summary: {
          rawTranscript: scanJob.objectHint ?? scanJob.promptHint ?? "Scan object",
          normalizedPrompt: scanJob.objectHint ?? scanJob.promptHint ?? "Scan object",
          concise: "Scan routed into reconstruction workflow.",
          userVisible: "Scan job is active and will package creator-ready exports.",
          warnings: scanJob.warnings.map((warning) => warning.label)
        },
        brief: {
          sourceKind: "scan",
          lane: "scan",
          destination: "portfolio",
          objectName: scanJob.objectHint ?? "Scanned Object",
          summary: "Scan routed into reconstruction workflow.",
          functionalIntent: "clean reconstruction with honest repair notes and export-ready variants",
          constraints: [],
          partSemantics: ["captured object"],
          materialTargets: ["captured surface"],
          motionTargets: ["turntable"],
          exportTargets: ["glb", "obj", "stl", "zip"],
          qualityTargets: {
            topology: "quad_remesh",
            texture: "pbr",
            manufacturable: false,
            riggable: false,
            cadFriendly: false
          },
          readiness: {
            score: Math.round(scanJob.progress * 100),
            label: "preview",
            checks: []
          },
          fallbackPolicy: {
            maxRepairAttempts: 0
          }
        },
        routePlan: {
          lane: "scan",
          destination: "portfolio",
          preview: {
            label: "Capture and coverage",
            provider: "reconstruction-worker",
            detail: "Upload inputs and monitor coverage."
          },
          final: {
            label: "Reconstruction finish",
            provider: "reconstruction-worker",
            detail: "Complete solve, cleanup, and packaging."
          },
          validation: ["coverage confidence", "reconstruction progress", "export pack"],
          exportPack: ["glb", "obj", "stl", "zip"],
          qaFocus: ["repair log", "coverage"],
          boundedAgents: ["summarizer", "router", "planner", "qa"],
          confidence: 0.72
        }
      },
      scanJob.objectHint ?? scanJob.promptHint ?? "Scan object",
      { scanId: scanJob.id }
    );

    return updateAssetJob(created.id, patch);
  }

  return updateAssetJob(existing.id, patch);
}
