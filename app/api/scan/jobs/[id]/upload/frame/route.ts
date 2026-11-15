import { readScanUpload, reserveScanUpload, scanUploadFailure } from "@/lib/security/scan-upload";
import { authorizeScanAccess } from "@/lib/security/scan-access";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { attachScanUpload, getScanJob } from "@/lib/scan-job-store";
import { syncAssetJobFromScan } from "@/lib/asset-jobs";
import { isVercelBlobConfigured } from "@/lib/vercel-blob";

export const maxDuration = 60;

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const denied = await authorizeScanAccess(request, params.id);
  if (denied) return denied;

  const job = await getScanJob(params.id, false);

  if (!job) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  if (!isVercelBlobConfigured()) {
    return NextResponse.json(
      { error: "Vercel Blob is not configured for upload persistence." },
      { status: 503 }
    );
  }

  let validated: Awaited<ReturnType<typeof readScanUpload>>;
  try {
    validated = await readScanUpload(request, "image");
    await reserveScanUpload(params.id, validated.file.size);
  } catch (error) {
    return scanUploadFailure(error);
  }
  const { form: formData, file } = validated;
  const uploadKind = formData.get("uploadKind");
  const metadataRaw = formData.get("metadata");
  const kind = uploadKind === "preview" ? "preview" : "keyframe";



  const blob = await put(
    `scan-jobs/${params.id}/frames/${Date.now()}-${sanitizeFileName(file.name || "frame.jpg")}`,
    file,
    {
      access: "public"
    }
  );

  const metadata =
    typeof metadataRaw === "string"
      ? (() => {
          try {
            return JSON.parse(metadataRaw) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : {};
  const summary = await attachScanUpload(params.id, {
    kind,
    fileName: file.name || "frame.jpg",
    url: blob.url,
    mimeType: file.type || "image/jpeg",
    sizeBytes: file.size,
    sourceDevice: "mobile",
    metadata: {
      ...metadata,
      pathname: blob.pathname
    }
  });

  if (summary) {
    syncAssetJobFromScan(summary);
  }

  return NextResponse.json({
    upload: summary?.uploads.find((item) => item.url === blob.url) ?? null,
    url: blob.url
  });
}
