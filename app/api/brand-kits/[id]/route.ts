/**
 * GET    /api/brand-kits/[id]   → read a brand kit
 * PATCH  /api/brand-kits/[id]   → update fields
 * DELETE /api/brand-kits/[id]   → remove
 *
 * RLS-enforced: a request can only touch the caller's own brand kits.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { userScopedClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  palette: z.array(z.string()).max(8).optional(),
  fonts: z.record(z.string()).optional(),
  voiceRules: z.record(z.unknown()).optional(),
  doNotUse: z.array(z.string()).max(20).optional()
});

function token(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(t);
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await supabase.from("brand_kits").select("*").eq("id", params.id).single();
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(t);
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  let patch: z.infer<typeof PatchSchema>;
  try {
    patch = PatchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid_input", details: String(err) }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;
  if (patch.palette !== undefined) update.palette = patch.palette;
  if (patch.fonts !== undefined) update.fonts = patch.fonts;
  if (patch.voiceRules !== undefined) update.voice_rules = patch.voiceRules;
  if (patch.doNotUse !== undefined) update.do_not_use = patch.doNotUse;

  const { data, error } = await supabase.from("brand_kits").update(update).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(t);
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { error } = await supabase.from("brand_kits").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
