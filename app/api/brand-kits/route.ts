/**
 * GET  /api/brand-kits          → list current user's brand kits
 * POST /api/brand-kits          → create a new brand kit
 *
 * Auth required. Uses the user-scoped Supabase client so RLS enforces ownership.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { userScopedClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().optional(),
  palette: z.array(z.string().regex(/^#?[0-9a-f]{3,8}$/i)).max(8).default([]),
  fonts: z
    .object({
      heading: z.string().max(80).optional(),
      body: z.string().max(80).optional(),
      mono: z.string().max(80).optional()
    })
    .default({}),
  voiceRules: z
    .object({
      tone: z.string().max(120).optional(),
      forbiddenPhrases: z.array(z.string().max(200)).max(20).optional()
    })
    .default({}),
  doNotUse: z.array(z.string().max(120)).max(20).default([])
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
  const { data, error } = await supabase
    .from("brand_kits")
    .select("id, name, logo_url, palette, fonts, voice_rules, do_not_use, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = userScopedClient(t);
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid_input", details: String(err) }, { status: 400 });
  }

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("brand_kits")
    .insert({
      user_id: user.user.id,
      name: body.name,
      logo_url: body.logoUrl ?? null,
      palette: body.palette,
      fonts: body.fonts,
      voice_rules: body.voiceRules,
      do_not_use: body.doNotUse
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
