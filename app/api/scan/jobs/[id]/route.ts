import { NextResponse } from "next/server";
import { getScanJob } from "@/lib/scan-job-store";

export const maxDuration = 30;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const job = await getScanJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  return NextResponse.json(job);
}
