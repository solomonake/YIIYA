/**
 * Next.js middleware.
 *
 *   - Adds nonce-able CSP context (we keep static CSP in next.config.mjs; this
 *     middleware exists primarily for rate-limit hooks + request ID stamping).
 *   - Generates a per-request X-Yiiya-Trace-Id and forwards it to handlers.
 *
 * Reference:
 *   https://nextjs.org/docs/app/building-your-application/routing/middleware
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const TRACE_HEADER = "x-yiiya-trace-id";

function randomTraceId(): string {
  // 16 hex bytes = 32 chars. Edge-safe via crypto.getRandomValues.
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  if (!requestHeaders.has(TRACE_HEADER)) {
    requestHeaders.set(TRACE_HEADER, randomTraceId());
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(TRACE_HEADER, requestHeaders.get(TRACE_HEADER)!);
  return response;
}

export const config = {
  matcher: [
    // Skip Next internals, static files, sitemap, robots.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|glb|usdz)$).*)"
  ]
};
