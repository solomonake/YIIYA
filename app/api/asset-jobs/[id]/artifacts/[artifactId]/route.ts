// @ts-nocheck
import { NextResponse } from "next/server";
import { getAssetJob } from "@/lib/asset-jobs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string; artifactId: string } }
) {
  const job = getAssetJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Asset job not found." }, { status: 404 });
  }

  const artifact = job.artifacts.find((item) => item.id === params.artifactId);

  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }

  if (artifact.url && !artifact.inlineText && artifact.inlineJson === undefined && !artifact.inlineBase64) {
    return Response.redirect(artifact.url);
  }

  if (artifact.inlineText !== undefined) {
    return new Response(artifact.inlineText, {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`
      }
    });
  }

  if (artifact.inlineJson !== undefined) {
    return new Response(JSON.stringify(artifact.inlineJson, null, 2), {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`
      }
    });
  }

  if (artifact.inlineBase64 !== undefined) {
    const body = Buffer.from(artifact.inlineBase64, "base64");

    return new Response(body, {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(body.byteLength),
        ...(artifact.format === "glb"
          ? {}
          : {
              "Content-Disposition": `attachment; filename="${artifact.fileName}"`
            })
      }
    });
  }

  return NextResponse.json({ error: "Artifact is unavailable." }, { status: 404 });
}
