import { authorizeScanWorker } from "@/lib/security/scan-worker-auth";
import { NextResponse } from "next/server";
import { applyReconstructionWebhook } from "@/lib/scan-job-store";
import { syncAssetJobFromScan } from "@/lib/asset-jobs";
import type {
  ScanAssetKind,
  ScanExportTier,
  ScanJobStage,
  ScanJobState,
  ScanRepairSummary,
  ScanStageReport,
  ScanWarning
} from "@/lib/scan-types";

export const maxDuration = 60;


export async function POST(request: Request) {
  const denied = authorizeScanWorker(request, "SCAN_RECONSTRUCTION_WEBHOOK_SECRET", "x-yiiya-webhook-secret");
  if (denied) return denied;

  const payload = (await request.json().catch(() => null)) as
    | {
        scanId?: string;
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
        stageReports?: ScanStageReport[];
        repairSummary?: ScanRepairSummary;
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
          format: "glb" | "obj" | "usdz" | "stl" | "zip";
          status: "pending" | "ready" | "failed";
          fileName: string;
          url?: string;
          sizeBytes?: number;
          metadata?: Record<string, unknown>;
        }>;
      }
    | null;

  if (!payload?.scanId) {
    return NextResponse.json({ error: "scanId is required." }, { status: 400 });
  }

  const result = await applyReconstructionWebhook({
    ...payload,
    scanId: payload.scanId
  });

  if (!result) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  syncAssetJobFromScan(result);
  return NextResponse.json({ ok: true, job: result });
}
