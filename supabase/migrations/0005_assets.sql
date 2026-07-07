-- Phase 1: durable asset history ("past products").
--
-- Every successful generation from lib/interpret-pipeline.ts is saved here for
-- signed-in users so they can revisit, re-download, or reopen past assets in
-- the studio. Anonymous generations are NOT persisted server-side (they stay
-- in the browser's Zustand store only) — signing in is what unlocks history,
-- matching standard SaaS expectations and avoiding a device-id claim system
-- we don't need yet.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id text,
  prompt text not null,
  object_name text not null,
  tier text not null check (tier in ('library', 'hunyuan3d', 'trellis', 'fallback')),
  glb_url text not null,
  poster_url text,
  triangle_count integer,
  scale_meters numeric,
  brief_json jsonb not null default '{}'::jsonb,
  export_formats jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index assets_owner_created_idx
  on public.assets (owner_id, created_at desc);

alter table public.assets enable row level security;

create policy "users manage their own assets"
  on public.assets
  for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Service-role writes (the generation stream route saves on the user's
-- behalf using SUPABASE_SERVICE_ROLE_KEY) bypass RLS entirely, so no
-- additional policy is needed for that path.
