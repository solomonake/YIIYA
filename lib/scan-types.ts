// @ts-nocheck
import type { CoverageCell, CoverageFrame, CoverageSilhouette } from "@/lib/scan-coverage";

export type ScanJobState =
  | "queued"
  | "ingesting"
  | "selecting"
  | "solving"
  | "meshing"
  | "cleaning"
  | "texturing"
  | "packaging"
  | "complete"
  | "failed"
  | "cancelled";

export type ScanJobStage =
  | "capture"
  | "ingest"
  | "keyframe_select"
  | "segment"
  | "camera_solve"
  | "dense_reconstruct"
  | "mesh_cleanup"
  | "retopo_uv"
  | "appearance_bake"
  | "package_exports";

export type ScanCaptureStatus = "waiting" | "capturing" | "uploading" | "uploaded";

export type ScanUploadKind = "video" | "keyframe" | "preview" | "mask" | "metadata";

export type ScanAssetKind =
  | ScanUploadKind
  | "mesh"
  | "preview-mesh"
  | "textured-mesh"
  | "point-cloud"
  | "uv-layout";

export type ScanExportTier = "mobile-preview" | "creator" | "print" | "source-pack";

export type ScanWarningSeverity = "info" | "warning" | "error";
export type ScanStageReportStatus =
  | "planned"
  | "running"
  | "ready"
  | "needs-input"
  | "heuristic"
  | "fallback"
  | "deferred"
  | "failed";

export type ScanWarning = {
  code: string;
  label: string;
  severity: ScanWarningSeverity;
};

export type ScanStageReport = {
  stage: ScanJobStage;
  status: ScanStageReportStatus;
  detail?: string;
  metrics?: Record<string, string | number | boolean | null>;
};

export type ScanRepairSummary = {
  fallbackMode?: "single-image" | "manual" | "none";
  usedFallbackMesh?: boolean;
  manifestUrl?: string;
  repairLogUrl?: string;
  sourcePackUrl?: string;
};

export type ScanUploadTargetMap = {
  captureUrl: string;
  videoUploadUrl: string;
  frameUploadUrl: string;
  completeUploadUrl: string;
  cancelUrl: string;
};

export type ScanUploadRecord = {
  id: string;
  kind: ScanUploadKind;
  fileName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sourceDevice: "desktop" | "mobile" | "worker";
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ScanAssetSummary = {
  id: string;
  kind: ScanAssetKind;
  label: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ScanExportSummary = {
  id: string;
  tier: ScanExportTier;
  format: "glb" | "obj" | "usdz" | "stl" | "zip";
  status: "pending" | "ready" | "failed";
  url?: string;
  fileName: string;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type ScanLatestFrame = Omit<CoverageFrame, "previewDataUrl"> & {
  previewImageUrl?: string;
  previewDataUrl?: string;
  silhouette?: CoverageSilhouette;
  sharpness?: number;
};

export type ScanJobSummary = {
  id: string;
  promptHint?: string;
  objectHint?: string;
  desktopUrl: string;
  mobileUrl: string;
  captureStatus: ScanCaptureStatus;
  state: ScanJobState;
  stage: ScanJobStage;
  progress: number;
  coverage: CoverageCell[];
  latestFrame?: ScanLatestFrame;
  warnings: ScanWarning[];
  stageReports: ScanStageReport[];
  repairSummary?: ScanRepairSummary;
  uploads: ScanUploadRecord[];
  assets: ScanAssetSummary[];
  exports: ScanExportSummary[];
  retries: number;
  worker?: "modal" | "fal-fallback" | "manual";
  workerJobId?: string | null;
  falRequestId?: string | null;
  lastError?: string | null;
  storageMode: "supabase" | "memory";
  createdAt: string;
  updatedAt: string;
};

export type ScanJobCreateResult = {
  scanId: string;
  mobileUrl: string;
  desktopUrl: string;
  uploadTargets: ScanUploadTargetMap;
  job: ScanJobSummary;
};
