import { NextResponse } from "next/server";

import { createSession, SESSION_TTL_SECONDS } from "@/lib/capture-session";

export const maxDuration = 30;

/**
 * Create a phone-companion capture session. The laptop `/app` calls this, then
 * renders a QR of `captureUrl` for the phone to scan. Only the opaque session id
 * travels in that URL — no user data, no secrets.
 */
export async function POST(request: Request) {
  try {
    const { id } = await createSession();
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      id,
      captureUrl: `${origin}/capture?session=${id}`,
      ttlSeconds: SESSION_TTL_SECONDS
    });
  } catch (error) {
    console.error("[CAPTURE SESSION CREATE ERROR]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
