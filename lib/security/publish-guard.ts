import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verify-request";
import { checkLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import type { PublishOwner } from "@/lib/supabase-projects";

/**
 * Admission for routes that write published_projects. Runs before the body is
 * read: a signed-in owner is required, and each owner gets the "publish" quota.
 * Returns the verified owner, or the Response to send back.
 */
export async function admitPublishWrite(request: Request): Promise<PublishOwner | Response> {
  const owner = await getVerifiedUser(request);

  if (!owner) {
    return NextResponse.json({ error: "Sign in to publish or save this project." }, { status: 401 });
  }

  const limit = await checkLimit("publish", `user:${owner.userId}`);

  if (limit.unavailable) {
    return NextResponse.json({ error: "Publishing is temporarily unavailable." }, { status: 503 });
  }

  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many publish requests. Try again later." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  return owner;
}
