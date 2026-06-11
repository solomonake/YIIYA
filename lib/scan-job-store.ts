import {
  coverageConfidence,
  emptyCoverage,
  mergeCoverage,
  type CoverageCell
} from "@/lib/scan-coverage";
import {
  type ScanAssetKind,
  type ScanAssetSummary,
  type ScanCaptureStatus,
  type ScanExportSummary,
  type ScanExportTier,
  type ScanJobCreateResult,
  type ScanJobStage,
  type ScanJobState,
  type ScanJobSummary,
  type ScanLatestFrame,
  type ScanRepairSummary,
  type ScanStageReport,
  type ScanUploadKind,
  type ScanUploadRecord,
  type ScanWarning
} from "@/lib/scan-types";
import { supabaseRestFetch, isSupabaseRestConfigured } from "@/lib/supabase-rest";

type ScanSessionRow = {
  id: string;
  prompt_hint?: string | null;
  object_hint?: string | null;
  desktop_url: string;
  mobile_url: string;
  capture_status: ScanCaptureStatus;
  coverage_json?: CoverageCell[] | null;
  latest_frame_json?: ScanLatestFrame | null;
  warning_json?: ScanWarning[] | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ScanJobRow = {
  id: string;
  session_id: string;
  state: ScanJobState;
  stage: ScanJobStage;
  progress: number;
  retries: number;
  worker?: "modal" | "fal-fallback" | "manual" | null;
  worker_job_id?: string | null;
  fal_request_id?: string | null;
  last_error?: string | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ScanUploadRow = {
  id: string;
  session_id: string;
  upload_kind: ScanUploadKind;
  file_name: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  source_device: "desktop" | "mobile" | "worker";
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
};

type ScanAssetRow = {
  id: string;
  session_id: string;
  job_id?: string | null;
  asset_kind: ScanAssetKind;
  label: string;
  file_name: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
};

type ScanExportRow = {
  id: string;
  session_id: string;
  job_id?: string | null;
  tier: ScanExportTier;
  file_format: ScanExportSummary["format"];
  status: ScanExportSummary["status"];
  file_name: string;
  url?: string | null;
  size_bytes?: number | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type FallbackScanRecord = {
  session: ScanSessionRow;
  job: ScanJobRow;
  uploads: ScanUploadRow[];
  assets: ScanAssetRow[];
  exports: ScanExportRow[];
};

type ReconstructionWebhookPayload = {
  scanId: string;
  state?: ScanJobState;
  stage?: ScanJobStage;
  progress?: number;
  retries?: number;
  worker?: "modal" | "fal-fallback" | "manual" | null;
  workerJobId?: string | null;
  falRequestId?: string | null;
  objectHint?: string;
  lastError?: string | null;
  warnings?: ScanWarning[];
  assets?: Array<{
    id?: string;
    kind: ScanAssetKind;
    label: string;
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  }>;
  exports?: Array<{
    id?: string;
    tier: ScanExportTier;
    format: ScanExportSummary["format"];
    status: ScanExportSummary["status"];
    fileName: string;
    url?: string;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  }>;
};

const globalStore = globalThis as typeof globalThis & {
  __yiiyaFallbackScanJobs?: Map<string, FallbackScanRecord>;
};

function fallbackStore() {
  if (!globalStore.__yiiyaFallbackScanJobs) {
    globalStore.__yiiyaFallbackScanJobs = new Map<string, FallbackScanRecord>();
  }

  return globalStore.__yiiyaFallbackScanJobs;
}

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arrayOr<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function recordOrNull(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function scanStageReportsFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const reports = arrayOr<ScanStageReport>(metadata?.stageReports);

  if (reports.length > 0) {
    return reports;
  }

  return [];
}

function scanRepairSummaryFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const summary = recordOrNull(metadata?.repairSummary);

  return summary ? (summary as ScanRepairSummary) : undefined;
}

function sortByCreatedAt<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function sortByUpdatedAt<T extends { updated_at: string }>(items: T[]) {
  return [...items].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
}

function mapUploadRow(row: ScanUploadRow): ScanUploadRecord {
  return {
    id: row.id,
    kind: row.upload_kind,
    fileName: row.file_name,
    url: row.url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sourceDevice: row.source_device,
    createdAt: row.created_at,
    metadata: row.metadata_json ?? {}
  };
}

function mapAssetRow(row: ScanAssetRow): ScanAssetSummary {
  return {
    id: row.id,
    kind: row.asset_kind,
    label: row.label,
    url: row.url,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    metadata: row.metadata_json ?? {}
  };
}

function mapExportRow(row: ScanExportRow): ScanExportSummary {
  return {
    id: row.id,
    tier: row.tier,
    format: row.file_format,
    status: row.status,
    url: row.url ?? undefined,
    fileName: row.file_name,
    sizeBytes: row.size_bytes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata_json ?? {}
  };
}

function buildUploadTargets(scanId: string) {
  return {
    captureUrl: `/api/scan/jobs/${scanId}/capture`,
    videoUploadUrl: `/api/scan/jobs/${scanId}/upload/video`,
    frameUploadUrl: `/api/scan/jobs/${scanId}/upload/frame`,
    completeUploadUrl: `/api/scan/jobs/${scanId}/complete-upload`,
    cancelUrl: `/api/scan/jobs/${scanId}/cancel`
  };
}

function buildSummary(
  session: ScanSessionRow,
  job: ScanJobRow,
  uploads: ScanUploadRow[],
  assets: ScanAssetRow[],
  exports: ScanExportRow[],
  storageMode: "supabase" | "memory"
): ScanJobSummary {
  return {
    id: session.id,
    promptHint: session.prompt_hint ?? undefined,
    objectHint: session.object_hint ?? undefined,
    desktopUrl: session.desktop_url,
    mobileUrl: session.mobile_url,
    captureStatus: session.capture_status,
    state: job.state,
    stage: job.stage,
    progress: numberOr(job.progress, 0),
    coverage: arrayOr<CoverageCell>(session.coverage_json),
    latestFrame: session.latest_frame_json ?? undefined,
    warnings: arrayOr<ScanWarning>(session.warning_json),
    stageReports: scanStageReportsFromMetadata(job.metadata_json),
    repairSummary: scanRepairSummaryFromMetadata(job.metadata_json),
    uploads: sortByCreatedAt(uploads).map(mapUploadRow),
    assets: sortByCreatedAt(assets).map(mapAssetRow),
    exports: sortByUpdatedAt(exports).map(mapExportRow),
    retries: numberOr(job.retries, 0),
    worker: job.worker ?? undefined,
    workerJobId: job.worker_job_id ?? null,
    falRequestId: job.fal_request_id ?? null,
    lastError: job.last_error ?? null,
    storageMode,
    createdAt: session.created_at,
    updatedAt: job.updated_at ?? session.updated_at
  };
}

function createInitialFallbackRecord(baseUrl: string, promptHint?: string) {
  const scanId = randomId("scan");
  const createdAt = nowIso();
  const session: ScanSessionRow = {
    id: scanId,
    prompt_hint: promptHint ?? null,
    object_hint: null,
    desktop_url: `${baseUrl}/app?scanJob=${scanId}`,
    mobile_url: `${baseUrl}/scan/${scanId}`,
    capture_status: "waiting",
    coverage_json: emptyCoverage(),
    latest_frame_json: null,
    warning_json: [],
    metadata_json: {},
    created_at: createdAt,
    updated_at: createdAt
  };
  const job: ScanJobRow = {
    id: randomId("job"),
    session_id: scanId,
    state: "queued",
    stage: "capture",
    progress: 0,
    retries: 0,
    worker: "manual",
    worker_job_id: null,
    fal_request_id: null,
    last_error: null,
    metadata_json: {},
    created_at: createdAt,
    updated_at: createdAt
  };

  return {
    session,
    job,
    uploads: [],
    assets: [],
    exports: []
  } satisfies FallbackScanRecord;
}

function primaryReferenceImageUrl(summary: ScanJobSummary) {
  return (
    summary.latestFrame?.previewImageUrl ??
    summary.assets.find((asset) => asset.kind === "preview")?.url ??
    summary.uploads.find((upload) => upload.kind === "preview")?.url ??
    summary.uploads.find((upload) => upload.kind === "keyframe")?.url
  );
}

async function readSingleRow<T>(path: string) {
  const response = await supabaseRestFetch(path, { method: "GET" }, "service");

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as T[];
  return rows[0] ?? null;
}

async function readRows<T>(path: string) {
  const response = await supabaseRestFetch(path, { method: "GET" }, "service");

  if (!response.ok) {
    return [] as T[];
  }

  return (await response.json()) as T[];
}

async function insertRows<T extends object>(table: string, payload: T | T[]) {
  const response = await supabaseRestFetch(table, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T[];
}

async function patchRows<T extends object>(path: string, payload: Partial<T>) {
  const response = await supabaseRestFetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T[];
}

async function loadSupabaseRecord(scanId: string) {
  const sessionParams = new URLSearchParams({
    select:
      "id,prompt_hint,object_hint,desktop_url,mobile_url,capture_status,coverage_json,latest_frame_json,warning_json,metadata_json,created_at,updated_at",
    id: `eq.${scanId}`,
    limit: "1"
  });
  const jobParams = new URLSearchParams({
    select:
      "id,session_id,state,stage,progress,retries,worker,worker_job_id,fal_request_id,last_error,metadata_json,created_at,updated_at",
    session_id: `eq.${scanId}`,
    limit: "1"
  });
  const uploadParams = new URLSearchParams({
    select:
      "id,session_id,upload_kind,file_name,url,mime_type,size_bytes,source_device,metadata_json,created_at",
    session_id: `eq.${scanId}`,
    order: "created_at.asc"
  });
  const assetParams = new URLSearchParams({
    select:
      "id,session_id,job_id,asset_kind,label,file_name,url,mime_type,size_bytes,metadata_json,created_at",
    session_id: `eq.${scanId}`,
    order: "created_at.asc"
  });
  const exportParams = new URLSearchParams({
    select:
      "id,session_id,job_id,tier,file_format,status,file_name,url,size_bytes,metadata_json,created_at,updated_at",
    session_id: `eq.${scanId}`,
    order: "updated_at.asc"
  });

  const [session, job, uploads, assets, exports] = await Promise.all([
    readSingleRow<ScanSessionRow>(`scan_sessions?${sessionParams}`),
    readSingleRow<ScanJobRow>(`scan_jobs?${jobParams}`),
    readRows<ScanUploadRow>(`scan_uploads?${uploadParams}`),
    readRows<ScanAssetRow>(`scan_assets?${assetParams}`),
    readRows<ScanExportRow>(`scan_exports?${exportParams}`)
  ]);

  if (!session || !job) {
    return null;
  }

  return { session, job, uploads, assets, exports };
}

function loadFallbackRecord(scanId: string) {
  return fallbackStore().get(scanId) ?? null;
}

async function persistFallbackCompatibleRecord(record: FallbackScanRecord) {
  if (!isSupabaseRestConfigured("service")) {
    fallbackStore().set(record.session.id, record);
    return record;
  }

  fallbackStore().set(record.session.id, record);
  return record;
}

async function updateSessionRow(
  scanId: string,
  updates: Partial<ScanSessionRow>
) {
  if (!isSupabaseRestConfigured("service")) {
    const current = loadFallbackRecord(scanId);

    if (!current) {
      return null;
    }

    current.session = {
      ...current.session,
      ...updates,
      updated_at: nowIso()
    };
    fallbackStore().set(scanId, current);
    return current.session;
  }

  const params = new URLSearchParams({
    id: `eq.${scanId}`,
    select:
      "id,prompt_hint,object_hint,desktop_url,mobile_url,capture_status,coverage_json,latest_frame_json,warning_json,metadata_json,created_at,updated_at"
  });
  const rows = await patchRows<ScanSessionRow>(`scan_sessions?${params}`, {
    ...updates,
    updated_at: nowIso()
  });

  return rows[0] ?? null;
}

async function updateJobRow(scanId: string, updates: Partial<ScanJobRow>) {
  if (!isSupabaseRestConfigured("service")) {
    const current = loadFallbackRecord(scanId);

    if (!current) {
      return null;
    }

    current.job = {
      ...current.job,
      ...updates,
      updated_at: nowIso()
    };
    fallbackStore().set(scanId, current);
    return current.job;
  }

  const params = new URLSearchParams({
    session_id: `eq.${scanId}`,
    select:
      "id,session_id,state,stage,progress,retries,worker,worker_job_id,fal_request_id,last_error,metadata_json,created_at,updated_at"
  });
  const rows = await patchRows<ScanJobRow>(`scan_jobs?${params}`, {
    ...updates,
    updated_at: nowIso()
  });

  return rows[0] ?? null;
}

async function addUploadRow(
  scanId: string,
  upload: Omit<ScanUploadRow, "id" | "session_id" | "created_at">
) {
  const row: ScanUploadRow = {
    id: randomId("upload"),
    session_id: scanId,
    created_at: nowIso(),
    ...upload
  };

  if (!isSupabaseRestConfigured("service")) {
    const current = loadFallbackRecord(scanId);

    if (!current) {
      return null;
    }

    current.uploads = [...current.uploads, row];
    fallbackStore().set(scanId, current);
    return row;
  }

  const rows = await insertRows<ScanUploadRow>("scan_uploads", row);
  return rows[0] ?? null;
}

async function addAssetRow(
  scanId: string,
  jobId: string | null,
  asset: Omit<ScanAssetRow, "id" | "session_id" | "job_id" | "created_at">
) {
  if (isSupabaseRestConfigured("service")) {
    const existingParams = new URLSearchParams({
      select:
        "id,session_id,job_id,asset_kind,label,file_name,url,mime_type,size_bytes,metadata_json,created_at",
      session_id: `eq.${scanId}`,
      asset_kind: `eq.${asset.asset_kind}`,
      url: `eq.${asset.url}`,
      limit: "1"
    });
    const existing = await readSingleRow<ScanAssetRow>(`scan_assets?${existingParams}`);

    if (existing) {
      return existing;
    }
  } else {
    const current = loadFallbackRecord(scanId);
    const existing = current?.assets.find(
      (item) => item.asset_kind === asset.asset_kind && item.url === asset.url
    );

    if (existing) {
      return existing;
    }
  }

  const row: ScanAssetRow = {
    id: randomId("asset"),
    session_id: scanId,
    job_id: jobId,
    created_at: nowIso(),
    ...asset
  };

  if (!isSupabaseRestConfigured("service")) {
    const current = loadFallbackRecord(scanId);

    if (!current) {
      return null;
    }

    current.assets = [...current.assets, row];
    fallbackStore().set(scanId, current);
    return row;
  }

  const rows = await insertRows<ScanAssetRow>("scan_assets", row);
  return rows[0] ?? null;
}

async function upsertExportRow(
  scanId: string,
  jobId: string | null,
  exportRow: Omit<ScanExportRow, "id" | "session_id" | "job_id" | "created_at" | "updated_at">
) {
  const now = nowIso();

  if (isSupabaseRestConfigured("service")) {
    const existingParams = new URLSearchParams({
      select:
        "id,session_id,job_id,tier,file_format,status,file_name,url,size_bytes,metadata_json,created_at,updated_at",
      session_id: `eq.${scanId}`,
      tier: `eq.${exportRow.tier}`,
      file_format: `eq.${exportRow.file_format}`,
      limit: "1"
    });
    const existing = await readSingleRow<ScanExportRow>(
      `scan_exports?${existingParams}`
    );

    if (existing) {
      const patchParams = new URLSearchParams({
        id: `eq.${existing.id}`,
        select:
          "id,session_id,job_id,tier,file_format,status,file_name,url,size_bytes,metadata_json,created_at,updated_at"
      });
      const rows = await patchRows<ScanExportRow>(`scan_exports?${patchParams}`, {
        ...exportRow,
        updated_at: now
      });
      return rows[0] ?? existing;
    }
  } else {
    const current = loadFallbackRecord(scanId);

    if (current) {
      const existingIndex = current.exports.findIndex(
        (item) =>
          item.tier === exportRow.tier && item.file_format === exportRow.file_format
      );

      if (existingIndex >= 0) {
        current.exports[existingIndex] = {
          ...current.exports[existingIndex],
          ...exportRow,
          updated_at: now
        };
        fallbackStore().set(scanId, current);
        return current.exports[existingIndex];
      }
    }
  }

  const row: ScanExportRow = {
    id: randomId("export"),
    session_id: scanId,
    job_id: jobId,
    created_at: now,
    updated_at: now,
    ...exportRow
  };

  if (!isSupabaseRestConfigured("service")) {
    const current = loadFallbackRecord(scanId);

    if (!current) {
      return null;
    }

    current.exports = [...current.exports, row];
    fallbackStore().set(scanId, current);
    return row;
  }

  const rows = await insertRows<ScanExportRow>("scan_exports", row);
  return rows[0] ?? null;
}

async function createSupabaseRecord(baseUrl: string, promptHint?: string) {
  const scanId = randomId("scan");
  const createdAt = nowIso();
  const sessionPayload: ScanSessionRow = {
    id: scanId,
    prompt_hint: promptHint ?? null,
    object_hint: null,
    desktop_url: `${baseUrl}/app?scanJob=${scanId}`,
    mobile_url: `${baseUrl}/scan/${scanId}`,
    capture_status: "waiting",
    coverage_json: emptyCoverage(),
    latest_frame_json: null,
    warning_json: [],
    metadata_json: {},
    created_at: createdAt,
    updated_at: createdAt
  };
  const jobPayload: ScanJobRow = {
    id: randomId("job"),
    session_id: scanId,
    state: "queued",
    stage: "capture",
    progress: 0,
    retries: 0,
    worker: "manual",
    worker_job_id: null,
    fal_request_id: null,
    last_error: null,
    metadata_json: {},
    created_at: createdAt,
    updated_at: createdAt
  };

  await insertRows<ScanSessionRow>("scan_sessions", sessionPayload);
  await insertRows<ScanJobRow>("scan_jobs", jobPayload);

  return {
    session: sessionPayload,
    job: jobPayload,
    uploads: [],
    assets: [],
    exports: []
  };
}

async function updateWarnings(scanId: string, warnings: ScanWarning[]) {
  const deduped = warnings.filter(
    (warning, index, collection) =>
      collection.findIndex((item) => item.code === warning.code) === index
  );

  return updateSessionRow(scanId, {
    warning_json: deduped
  });
}

async function ensureFalFallbackStatus(summary: ScanJobSummary) {
  if (summary.worker !== "fal-fallback" || !summary.falRequestId || !process.env.FAL_KEY) {
    return summary;
  }

  if (summary.state === "complete" || summary.state === "failed" || summary.state === "cancelled") {
    return summary;
  }

  const modelId = process.env.FAL_TRELLIS_MODEL ?? "fal-ai/trellis-2";
  const statusResponse = await fetch(
    `https://queue.fal.run/${modelId}/requests/${summary.falRequestId}/status?logs=1`,
    {
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`
      }
    }
  );

  if (!statusResponse.ok) {
    return summary;
  }

  const statusPayload = (await statusResponse.json()) as {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
    response_url?: string;
    error?: string;
  };

  if (statusPayload.status === "IN_QUEUE") {
    await updateJobRow(summary.id, {
      state: "queued",
      stage: "ingest",
      progress: Math.max(summary.progress, 0.12)
    });
    return (await getScanJob(summary.id)) ?? summary;
  }

  if (statusPayload.status === "IN_PROGRESS") {
    await updateJobRow(summary.id, {
      state: "meshing",
      stage: "dense_reconstruct",
      progress: Math.max(summary.progress, 0.55)
    });
    return (await getScanJob(summary.id)) ?? summary;
  }

  if (statusPayload.status === "COMPLETED") {
    const resultUrl =
      statusPayload.response_url ??
      `https://queue.fal.run/${modelId}/requests/${summary.falRequestId}`;
    const resultResponse = await fetch(resultUrl, {
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`
      }
    });

    if (!resultResponse.ok) {
      await updateJobRow(summary.id, {
        state: "failed",
        stage: "appearance_bake",
        last_error: "fal fallback result retrieval failed"
      });
      return (await getScanJob(summary.id)) ?? summary;
    }

    const resultPayload = (await resultResponse.json()) as {
      model_glb?: { url?: string; file_name?: string; content_type?: string; file_size?: number };
      data?: {
        model_glb?: { url?: string; file_name?: string; content_type?: string; file_size?: number };
      };
      error?: string;
    };
    const glb =
      resultPayload.model_glb ??
      resultPayload.data?.model_glb;

    if (!glb?.url) {
      await updateJobRow(summary.id, {
        state: "failed",
        stage: "appearance_bake",
        last_error: resultPayload.error ?? "fal fallback returned no mesh url"
      });
      return (await getScanJob(summary.id)) ?? summary;
    }

    const refreshed = await loadSupabaseRecord(summary.id);
    const jobId = refreshed?.job.id ?? loadFallbackRecord(summary.id)?.job.id ?? null;
    await addAssetRow(summary.id, jobId, {
      asset_kind: "preview-mesh",
      label: "Single-image fallback mesh",
      file_name: glb.file_name ?? `scan-${summary.id}-preview.glb`,
      url: glb.url,
      mime_type: glb.content_type ?? "model/gltf-binary",
      size_bytes: glb.file_size ?? 0,
      metadata_json: {
        worker: "fal-fallback"
      }
    });
    await upsertExportRow(summary.id, jobId, {
      tier: "mobile-preview",
      file_format: "glb",
      status: "ready",
      file_name: glb.file_name ?? `scan-${summary.id}-preview.glb`,
      url: glb.url,
      size_bytes: glb.file_size ?? 0,
      metadata_json: {
        fallbackMode: "single-image"
      }
    });
    await upsertExportRow(summary.id, jobId, {
      tier: "creator",
      file_format: "glb",
      status: "ready",
      file_name: glb.file_name ?? `scan-${summary.id}-creator.glb`,
      url: glb.url,
      size_bytes: glb.file_size ?? 0,
      metadata_json: {
        fallbackMode: "single-image"
      }
    });
    await updateWarnings(summary.id, [
      ...summary.warnings,
      {
        code: "single-image-fallback",
        label: "Using single-image mesh fallback until the dedicated reconstruction backend is connected.",
        severity: "warning"
      }
    ]);
    await updateJobRow(summary.id, {
      state: "complete",
      stage: "package_exports",
      progress: 1,
      last_error: null
    });
  }

  return (await getScanJob(summary.id, false)) ?? summary;
}

async function submitFalFallback(summary: ScanJobSummary) {
  const imageUrl = primaryReferenceImageUrl(summary);
  const modelId = process.env.FAL_TRELLIS_MODEL ?? "fal-ai/trellis-2";

  if (!process.env.FAL_KEY || !imageUrl) {
    await updateWarnings(summary.id, [
      ...summary.warnings,
      {
        code: "backend-unconfigured",
        label: "No reconstruction backend is configured yet. Uploads are durable, but processing is waiting for Modal or fal fallback setup.",
        severity: "warning"
      }
    ]);
    return null;
  }

  const response = await fetch(`https://queue.fal.run/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image_url: imageUrl,
      resolution: 1024,
      texture_size: 2048,
      decimation_target: 50000,
      remesh: true
    })
  });

  if (!response.ok) {
    const message = await response.text();
    await updateJobRow(summary.id, {
      state: "failed",
      stage: "appearance_bake",
      last_error: `fal fallback failed: ${message}`
    });
    return null;
  }

  const payload = (await response.json()) as {
    request_id?: string;
  };

  if (!payload.request_id) {
    await updateJobRow(summary.id, {
      state: "failed",
      stage: "appearance_bake",
      last_error: "fal fallback request id was missing"
    });
    return null;
  }

  await updateJobRow(summary.id, {
    worker: "fal-fallback",
    fal_request_id: payload.request_id,
    state: "solving",
    stage: "camera_solve",
    progress: 0.24,
    last_error: null
  });
  await updateWarnings(summary.id, [
    ...summary.warnings,
    {
      code: "single-image-fallback",
      label: "Using Trellis single-image fallback until the dedicated reconstruction backend is connected.",
      severity: "warning"
    }
  ]);

  return payload.request_id;
}

async function triggerExternalReconstruction(summary: ScanJobSummary) {
  const endpoint = process.env.SCAN_RECONSTRUCTION_ENDPOINT;
  const secret = process.env.SCAN_RECONSTRUCTION_API_KEY;

  if (!endpoint) {
    return false;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {})
    },
    body: JSON.stringify({
      scanId: summary.id,
      promptHint: summary.promptHint,
      objectHint: summary.objectHint,
      desktopUrl: summary.desktopUrl,
      mobileUrl: summary.mobileUrl,
      uploads: summary.uploads,
      warnings: summary.warnings
    })
  });

  if (!response.ok) {
    await updateWarnings(summary.id, [
      ...summary.warnings,
      {
        code: "reconstruction-dispatch-failed",
        label: "The dedicated reconstruction backend rejected this scan dispatch. Falling back if possible.",
        severity: "warning"
      }
    ]);
    return false;
  }

  await updateJobRow(summary.id, {
    worker: "modal",
    state: "ingesting",
    stage: "ingest",
    progress: 0.08,
    last_error: null
  });
  return true;
}

export async function createScanJob(baseUrl: string, promptHint?: string): Promise<ScanJobCreateResult> {
  const record = isSupabaseRestConfigured("service")
    ? await createSupabaseRecord(baseUrl, promptHint)
    : await persistFallbackCompatibleRecord(createInitialFallbackRecord(baseUrl, promptHint));
  const summary = buildSummary(
    record.session,
    record.job,
    record.uploads,
    record.assets,
    record.exports,
    isSupabaseRestConfigured("service") ? "supabase" : "memory"
  );

  return {
    scanId: summary.id,
    mobileUrl: summary.mobileUrl,
    desktopUrl: summary.desktopUrl,
    uploadTargets: buildUploadTargets(summary.id),
    job: summary
  };
}

export async function getScanJob(scanId: string, syncFallback = true): Promise<ScanJobSummary | null> {
  const record = isSupabaseRestConfigured("service")
    ? await loadSupabaseRecord(scanId)
    : loadFallbackRecord(scanId);

  if (!record) {
    return null;
  }

  const summary = buildSummary(
    record.session,
    record.job,
    record.uploads,
    record.assets,
    record.exports,
    isSupabaseRestConfigured("service") ? "supabase" : "memory"
  );

  return syncFallback ? ensureFalFallbackStatus(summary) : summary;
}

export async function updateScanCapture(
  scanId: string,
  payload: {
    objectHint?: string;
    frame?: ScanLatestFrame;
    captureStatus?: ScanCaptureStatus;
  }
) {
  const current = await getScanJob(scanId, false);

  if (!current) {
    return null;
  }

  const nextCoverage = payload.frame?.coverage
    ? mergeCoverage(current.coverage, payload.frame.coverage)
    : current.coverage;
  const latestFrame = payload.frame
    ? {
        ...current.latestFrame,
        ...payload.frame,
        coverage: payload.frame.coverage ?? current.latestFrame?.coverage ?? current.coverage
      }
    : current.latestFrame;
  await updateSessionRow(scanId, {
    object_hint: payload.objectHint ?? current.objectHint ?? null,
    capture_status: payload.captureStatus ?? current.captureStatus,
    coverage_json: nextCoverage,
    latest_frame_json: latestFrame ?? null
  });
  const coverageLevel = coverageConfidence(nextCoverage);
  await updateJobRow(scanId, {
    stage: "capture",
    progress: Math.max(current.progress, Math.min(0.82, coverageLevel * 0.8))
  });

  return getScanJob(scanId, false);
}

export async function attachScanUpload(
  scanId: string,
  input: {
    kind: ScanUploadKind;
    fileName: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    sourceDevice: "desktop" | "mobile" | "worker";
    metadata?: Record<string, unknown>;
  }
) {
  const current = await getScanJob(scanId, false);

  if (!current) {
    return null;
  }

  await addUploadRow(scanId, {
    upload_kind: input.kind,
    file_name: input.fileName,
    url: input.url,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    source_device: input.sourceDevice,
    metadata_json: input.metadata ?? {}
  });

  if (input.kind === "preview" || input.kind === "keyframe") {
    const latestFrame: ScanLatestFrame = {
      ...(current.latestFrame ?? {
        coverage: current.coverage,
        confidence: 0,
        updatedAt: nowIso()
      }),
      previewImageUrl: input.url
    };
    await updateSessionRow(scanId, {
      latest_frame_json: latestFrame
    });
  }

  if (input.kind === "preview") {
    const reloaded = await getScanJob(scanId, false);
    const jobRecord = isSupabaseRestConfigured("service")
      ? await loadSupabaseRecord(scanId)
      : loadFallbackRecord(scanId);

    await addAssetRow(scanId, jobRecord?.job.id ?? null, {
      asset_kind: "preview",
      label: "Latest mobile preview",
      file_name: input.fileName,
      url: input.url,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      metadata_json: input.metadata ?? {}
    });
    return reloaded;
  }

  return getScanJob(scanId, false);
}

export async function completeScanUpload(
  scanId: string,
  payload: {
    objectHint?: string;
    durationMs?: number;
    keyframeCount?: number;
  } = {}
) {
  const current = await getScanJob(scanId, false);

  if (!current) {
    return null;
  }

  await updateSessionRow(scanId, {
    object_hint: payload.objectHint ?? current.objectHint ?? null,
    capture_status: "uploaded",
    metadata_json: {
      durationMs: payload.durationMs ?? null,
      keyframeCount: payload.keyframeCount ?? null
    }
  });
  await updateJobRow(scanId, {
    state: "queued",
    stage: "ingest",
    progress: Math.max(current.progress, 0.05),
    last_error: null
  });
  const refreshed = await getScanJob(scanId, false);

  if (!refreshed) {
    return null;
  }

  const record = isSupabaseRestConfigured("service")
    ? await loadSupabaseRecord(scanId)
    : loadFallbackRecord(scanId);
  const jobId = record?.job.id ?? null;

  await Promise.all([
    upsertExportRow(scanId, jobId, {
      tier: "mobile-preview",
      file_format: "glb",
      status: "pending",
      file_name: `scan-${scanId}-mobile-preview.glb`,
      metadata_json: {
        stage: "preview"
      }
    }),
    upsertExportRow(scanId, jobId, {
      tier: "creator",
      file_format: "glb",
      status: "pending",
      file_name: `scan-${scanId}-creator.glb`,
      metadata_json: {
        stage: "creator"
      }
    }),
    upsertExportRow(scanId, jobId, {
      tier: "creator",
      file_format: "obj",
      status: "pending",
      file_name: `scan-${scanId}-creator.obj`,
      metadata_json: {
        stage: "creator"
      }
    }),
    upsertExportRow(scanId, jobId, {
      tier: "creator",
      file_format: "usdz",
      status: "pending",
      file_name: `scan-${scanId}-creator.usdz`,
      metadata_json: {
        stage: "creator"
      }
    }),
    upsertExportRow(scanId, jobId, {
      tier: "print",
      file_format: "stl",
      status: "pending",
      file_name: `scan-${scanId}-print.stl`,
      metadata_json: {
        stage: "print"
      }
    }),
    upsertExportRow(scanId, jobId, {
      tier: "source-pack",
      file_format: "zip",
      status: "pending",
      file_name: `scan-${scanId}-source-pack.zip`,
      metadata_json: {
        stage: "source-pack"
      }
    })
  ]);

  const externalTriggered = await triggerExternalReconstruction(refreshed);

  if (!externalTriggered) {
    await submitFalFallback(refreshed);
  }

  return getScanJob(scanId, false);
}

export async function cancelScanJob(scanId: string) {
  const current = await getScanJob(scanId, false);

  if (!current) {
    return null;
  }

  if (current.worker === "fal-fallback" && current.falRequestId && process.env.FAL_KEY) {
    const modelId = process.env.FAL_TRELLIS_MODEL ?? "fal-ai/trellis-2";
    await fetch(
      `https://queue.fal.run/${modelId}/requests/${current.falRequestId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${process.env.FAL_KEY}`
        }
      }
    ).catch(() => null);
  }

  await updateJobRow(scanId, {
    state: "cancelled",
    stage: "package_exports",
    last_error: null
  });
  await updateSessionRow(scanId, {
    capture_status: current.captureStatus === "uploaded" ? "uploaded" : "capturing"
  });

  return getScanJob(scanId, false);
}

export async function applyReconstructionWebhook(payload: ReconstructionWebhookPayload) {
  const current = await getScanJob(payload.scanId, false);

  if (!current) {
    return null;
  }

  if (payload.objectHint) {
    await updateSessionRow(payload.scanId, {
      object_hint: payload.objectHint
    });
  }

  if (payload.warnings) {
    await updateWarnings(payload.scanId, payload.warnings);
  }

  await updateJobRow(payload.scanId, {
    state: payload.state ?? current.state,
    stage: payload.stage ?? current.stage,
    progress:
      typeof payload.progress === "number" ? payload.progress : current.progress,
    retries: typeof payload.retries === "number" ? payload.retries : current.retries,
    worker: payload.worker ?? current.worker ?? "modal",
    worker_job_id:
      payload.workerJobId !== undefined ? payload.workerJobId : current.workerJobId,
    fal_request_id:
      payload.falRequestId !== undefined ? payload.falRequestId : current.falRequestId,
    last_error:
      payload.lastError !== undefined ? payload.lastError : current.lastError
  });

  const record = isSupabaseRestConfigured("service")
    ? await loadSupabaseRecord(payload.scanId)
    : loadFallbackRecord(payload.scanId);
  const jobId = record?.job.id ?? null;

  for (const asset of payload.assets ?? []) {
    await addAssetRow(payload.scanId, jobId, {
      asset_kind: asset.kind,
      label: asset.label,
      file_name: asset.fileName,
      url: asset.url,
      mime_type: asset.mimeType,
      size_bytes: asset.sizeBytes ?? 0,
      metadata_json: asset.metadata ?? {}
    });
  }

  for (const item of payload.exports ?? []) {
    await upsertExportRow(payload.scanId, jobId, {
      tier: item.tier,
      file_format: item.format,
      status: item.status,
      file_name: item.fileName,
      url: item.url,
      size_bytes: item.sizeBytes,
      metadata_json: item.metadata ?? {}
    });
  }

  return getScanJob(payload.scanId, false);
}

export async function applyFalWebhook(
  payload: {
    request_id?: string;
    status?: "OK" | "ERROR";
    payload?: {
      model_glb?: { url?: string; file_name?: string; content_type?: string; file_size?: number };
      data?: {
        model_glb?: { url?: string; file_name?: string; content_type?: string; file_size?: number };
      };
      error?: string;
    };
  }
) {
  const requestId = payload.request_id;

  if (!requestId) {
    return null;
  }

  let summary: ScanJobSummary | null = null;

  if (isSupabaseRestConfigured("service")) {
    const params = new URLSearchParams({
      select:
        "id,session_id,state,stage,progress,retries,worker,worker_job_id,fal_request_id,last_error,metadata_json,created_at,updated_at",
      fal_request_id: `eq.${requestId}`,
      limit: "1"
    });
    const job = await readSingleRow<ScanJobRow>(`scan_jobs?${params}`);
    summary = job ? await getScanJob(job.session_id, false) : null;
  } else {
    for (const record of Array.from(fallbackStore().values())) {
      if (record.job.fal_request_id === requestId) {
        summary = buildSummary(
          record.session,
          record.job,
          record.uploads,
          record.assets,
          record.exports,
          "memory"
        );
        break;
      }
    }
  }

  if (!summary) {
    return null;
  }

  if (payload.status === "ERROR") {
    await updateJobRow(summary.id, {
      state: "failed",
      stage: "appearance_bake",
      last_error: payload.payload?.error ?? "fal webhook reported an error"
    });
    return getScanJob(summary.id, false);
  }

  const glb =
    payload.payload?.model_glb ??
    payload.payload?.data?.model_glb;

  if (!glb?.url) {
    return summary;
  }

  return applyReconstructionWebhook({
    scanId: summary.id,
    state: "complete",
    stage: "package_exports",
    progress: 1,
    assets: [
      {
        kind: "preview-mesh",
        label: "Single-image fallback mesh",
        url: glb.url,
        fileName: glb.file_name ?? `scan-${summary.id}-preview.glb`,
        mimeType: glb.content_type ?? "model/gltf-binary",
        sizeBytes: glb.file_size ?? 0,
        metadata: {
          worker: "fal-fallback"
        }
      }
    ],
    exports: [
      {
        tier: "mobile-preview",
        format: "glb",
        status: "ready",
        fileName: glb.file_name ?? `scan-${summary.id}-preview.glb`,
        url: glb.url,
        sizeBytes: glb.file_size ?? 0,
        metadata: {
          fallbackMode: "single-image"
        }
      },
      {
        tier: "creator",
        format: "glb",
        status: "ready",
        fileName: glb.file_name ?? `scan-${summary.id}-creator.glb`,
        url: glb.url,
        sizeBytes: glb.file_size ?? 0,
        metadata: {
          fallbackMode: "single-image"
        }
      }
    ]
  });
}

export function getScanInfraStatus() {
  return {
    supabaseConfigured: isSupabaseRestConfigured("service"),
    blobConfigured:
      Boolean(process.env.BLOB_READ_WRITE_TOKEN) &&
      !process.env.BLOB_READ_WRITE_TOKEN?.includes("your_"),
    modalConfigured: Boolean(process.env.SCAN_RECONSTRUCTION_ENDPOINT),
    falConfigured: Boolean(process.env.FAL_KEY)
  };
}
