import { NextResponse } from "next/server";
import { applyReconstructionWebhook } from "@/lib/scan-job-store";
import type { ScanJobStage, ScanJobState, ScanWarning, ScanAssetKind, ScanExportTier } from "@/lib/scan-types";

export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.SCAN_RECONSTRUCTION_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  return request.headers.get("x-yiiya-webhook-secret") === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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

  return NextResponse.json({ ok: true, job: result });
}
