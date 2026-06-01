/**
 * GET   /api/memory/profile          → the calling user's profile
 * PATCH /api/memory/profile          → update preferences or notes
 *
 * The user can see *and edit* what YIIYA has learned about them — trust UX.
 * The /me/memory page renders this.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { userScopedClient } from "@/lib/supabase-server";
import { readProfile } from "@/lib/memory/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  preferences: z.record(z.unknown()).optional(),
  notes: z
    .array(
      z.object({
        text: z.string().min(1).max(280),
        evidenceCount: z.number().int().nonnegative().default(1),
        createdAt: z.string().datetime().optional(),
        lastReinforcedAt: z.string().datetime().optional()
      })
    )
    .max(50)
    .optional()
});

function token(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function GET(req: NextRequest) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(t);
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await readProfile(user.user.id);
  return NextResponse.json(profile ?? { preferences: {}, notes: [] });
}

export async function PATCH(req: NextRequest) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(t);
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let patch: z.infer<typeof PatchSchema>;
  try {
    patch = PatchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid_input", details: String(err) }, { status: 400 });
  }

  const update: Record<string, unknown> = { last_updated_at: new Date().toISOString() };
  if (patch.preferences) update.preferences = patch.preferences;
  if (patch.notes) update.notes = patch.notes;

  const { data, error } = await supabase
    .from("user_profile")
    .upsert({ user_id: user.user.id, ...update }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
