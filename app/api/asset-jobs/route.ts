import { NextResponse } from "next/server";
import { listAssetJobs } from "@/lib/asset-jobs";

export async function GET() {
  return NextResponse.json({ jobs: listAssetJobs() });
}
