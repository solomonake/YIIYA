import { NextResponse } from "next/server";
import { getAssetJob } from "@/lib/asset-jobs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const job = getAssetJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Asset job not found." }, { status: 404 });
  }

  return NextResponse.json(job);
}
