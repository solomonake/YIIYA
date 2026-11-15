import { authorizeScanWorker } from "@/lib/security/scan-worker-auth";
import { NextResponse } from "next/server";
import { applyFalWebhook } from "@/lib/scan-job-store";

export const maxDuration = 60;


export async function POST(request: Request) {
  const denied = authorizeScanWorker(request, "SCAN_FAL_WEBHOOK_SECRET", "x-yiiya-webhook-secret");
  if (denied) return denied;

  const payload = (await request.json().catch(() => null)) as
    | {
        request_id?: string;
        status?: "OK" | "ERROR";
        payload?: {
          model_glb?: {
            url?: string;
            file_name?: string;
            content_type?: string;
            file_size?: number;
          };
          data?: {
            model_glb?: {
              url?: string;
              file_name?: string;
              content_type?: string;
              file_size?: number;
            };
          };
          error?: string;
        };
      }
    | null;

  if (!payload?.request_id) {
    return NextResponse.json({ error: "request_id is required." }, { status: 400 });
  }

  const result = await applyFalWebhook(payload);

  if (!result) {
    return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job: result });
}
