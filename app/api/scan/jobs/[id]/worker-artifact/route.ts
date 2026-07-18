import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isVercelBlobConfigured } from "@/lib/vercel-blob";
import { getScanJob, registerWorkerArtifact } from "@/lib/scan-job-store";
import { syncAssetJobFromScan } from "@/lib/asset-jobs";
import type { ScanAssetKind, ScanExportSummary, ScanExportTier } from "@/lib/scan-types";

export const maxDuration = 120;

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function isAuthorized(request: Request) {
  const secret = process.env.SCAN_RECONSTRUCTION_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  return request.headers.get("x-yiiya-worker-secret") === secret;
}

function parseMetadata(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const job = await getScanJob(params.id, false);

  if (!job) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  if (!isVercelBlobConfigured()) {
    return NextResponse.json(
      { error: "Vercel Blob is not configured for worker artifact persistence." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const target = formData.get("target");
  const label = formData.get("label");
  const metadata = parseMetadata(formData.get("metadata"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  if (target !== "asset" && target !== "export") {
    return NextResponse.json({ error: "Expected target=asset or target=export." }, { status: 400 });
  }

  if (typeof label !== "string" || !label.trim()) {
    return NextResponse.json({ error: "Artifact label is required." }, { status: 400 });
  }

  const blob = await put(
    `scan-jobs/${params.id}/worker/${Date.now()}-${sanitizeFileName(file.name || "artifact.bin")}`,
    file,
    {
      access: "public"
    }
  );

  const summary =
    target === "asset"
      ? await registerWorkerArtifact(params.id, {
          target: "asset",
          assetKind: String(formData.get("assetKind") || "metadata") as ScanAssetKind,
          label: label.trim(),
          fileName: file.name || "artifact.bin",
          url: blob.url,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          metadata: {
            pathname: blob.pathname,
            ...metadata
          }
        })
      : await registerWorkerArtifact(params.id, {
          target: "export",
          tier: String(formData.get("tier") || "source-pack") as ScanExportTier,
          format: String(formData.get("format") || "zip") as ScanExportSummary["format"],
          status: String(formData.get("status") || "ready") as ScanExportSummary["status"],
          fileName: file.name || "artifact.bin",
          url: blob.url,
          sizeBytes: file.size,
          metadata: {
            pathname: blob.pathname,
            ...metadata
          }
        });

  if (summary) {
    syncAssetJobFromScan(summary);
  }

  return NextResponse.json({
    url: blob.url,
    artifact: summary,
  });
}
