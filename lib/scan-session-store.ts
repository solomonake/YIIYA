import { coverageConfidence, emptyCoverage, mergeCoverage, type CoverageCell, type CoverageFrame } from "@/lib/scan-coverage";

export type ScanSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "waiting" | "capturing" | "ready";
  desktopUrl: string;
  mobileUrl: string;
  promptHint?: string;
  objectHint?: string;
  coverage: CoverageCell[];
  latestFrame?: CoverageFrame;
};

const globalStore = globalThis as typeof globalThis & {
  __yiiyaScanSessions?: Map<string, ScanSession>;
};

function sessionMap() {
  if (!globalStore.__yiiyaScanSessions) {
    globalStore.__yiiyaScanSessions = new Map<string, ScanSession>();
  }

  return globalStore.__yiiyaScanSessions;
}

export function createScanSession(baseUrl: string, promptHint?: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  const session: ScanSession = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "waiting",
    desktopUrl: `${baseUrl}/app?scanSession=${id}`,
    mobileUrl: `${baseUrl}/scan/${id}`,
    promptHint,
    coverage: emptyCoverage()
  };

  sessionMap().set(id, session);
  return session;
}

export function getScanSession(id: string) {
  return sessionMap().get(id) ?? null;
}

export function updateScanSession(
  id: string,
  payload: Partial<Pick<ScanSession, "status" | "promptHint" | "objectHint">> & {
    frame?: CoverageFrame;
  }
) {
  const current = getScanSession(id);

  if (!current) {
    return null;
  }

  const coverage = payload.frame
    ? mergeCoverage(current.coverage, payload.frame.coverage)
    : current.coverage;
  const next: ScanSession = {
    ...current,
    ...payload,
    coverage,
    latestFrame: payload.frame ?? current.latestFrame,
    objectHint: payload.objectHint ?? payload.frame?.objectHint ?? current.objectHint,
    status:
      payload.status ??
      (coverageConfidence(coverage) >= 0.7 ? "ready" : "capturing"),
    updatedAt: new Date().toISOString()
  };

  sessionMap().set(id, next);
  return next;
}
