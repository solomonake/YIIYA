import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { attachScanUpload, getScanJob } from "@/lib/scan-job-store";
import { isVercelBlobConfigured } from "@/lib/vercel-blob";

export const maxDuration = 60;

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
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

  const formData = await request.formData();
  const file = formData.get("file");
  const uploadKind = formData.get("uploadKind");
  const metadataRaw = formData.get("metadata");
  const kind = uploadKind === "preview" ? "preview" : "keyframe";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected an image frame file." }, { status: 400 });
  }

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
      pathname: blob.pathname,
      ...metadata
    }
  });

  return NextResponse.json({
    upload: summary?.uploads.find((item) => item.url === blob.url) ?? null,
    url: blob.url
  });
}
