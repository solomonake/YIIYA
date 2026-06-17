-- =============================================================================
-- 0003_production_foundation.sql
-- =============================================================================
-- Adds the tables that back the Week 1 production foundation:
--   * usage_events      — per-call cost + latency telemetry
--   * rate_limits       — fallback rate-limit ledger (Upstash primary, Postgres backup)
--   * episodic_memory   — per-user interaction history with pgvector embeddings
--   * user_profile      — semantic memory: preferences + notes-to-self
--   * brand_kits        — uploaded logos, palettes, font choices, tone rules
--   * moderation_log    — audit trail for prompt-firewall + content moderation
--   * published_views   — analytics rollup for /p/[slug]
-- All tables RLS-enabled. Service role bypasses for system writes.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- -----------------------------------------------------------------------------
-- usage_events
-- -----------------------------------------------------------------------------
create table if not exists public.usage_events (
  id                uuid primary key default gen_random_uuid(),
  occurred_at       timestamptz not null default now(),
  user_id           uuid references auth.users(id) on delete set null,
  session_id        uuid,
  trace_id          text,
  stage             text not null,
  provider          text not null,
  model             text,
  prompt_tokens     int,
  completion_tokens int,
  latency_ms        int,
  cost_usd          numeric(10, 6) not null default 0,
  success           boolean not null default true,
  error_code        text,
  metadata          jsonb not null default '{}'::jsonb
);
create index if not exists usage_events_user_day_idx
  on public.usage_events (user_id, ((occurred_at AT TIME ZONE 'UTC')::date));
create index if not exists usage_events_trace_idx on public.usage_events (trace_id);

alter table public.usage_events enable row level security;
create policy usage_events_owner_select on public.usage_events
  for select using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- rate_limits  (fallback when Upstash is unreachable)
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key         text not null,
  window_start timestamptz not null,
  count       int not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_recency_idx on public.rate_limits (window_start desc);

-- -----------------------------------------------------------------------------
-- episodic_memory
-- -----------------------------------------------------------------------------
create table if not exists public.episodic_memory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  session_id      uuid,
  occurred_at     timestamptz not null default now(),
  event_kind      text not null check (event_kind in (
                    'prompt', 'rejection', 'lock_in', 'undo', 'export', 'publish', 'edit'
                  )),
  prompt_text     text,
  resolved_intent jsonb,
  outcome         text check (outcome in ('accepted', 'undone', 'edited', 'exported', 'published', 'rejected') or outcome is null),
  context         jsonb not null default '{}'::jsonb,
  embedding       vector(768)
);
create index if not exists episodic_memory_user_time_idx
  on public.episodic_memory (user_id, occurred_at desc);
create index if not exists episodic_memory_embedding_idx
  on public.episodic_memory using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.episodic_memory enable row level security;
create policy episodic_memory_owner_all on public.episodic_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- user_profile  (one row per user — semantic memory)
-- -----------------------------------------------------------------------------
create table if not exists public.user_profile (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  preferences       jsonb not null default '{}'::jsonb,
  notes             jsonb not null default '[]'::jsonb,
  last_updated_at   timestamptz not null default now(),
  schema_version    int not null default 1
);

alter table public.user_profile enable row level security;
create policy user_profile_owner_select on public.user_profile
  for select using (auth.uid() = user_id);
create policy user_profile_owner_update on public.user_profile
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_profile_owner_insert on public.user_profile
  for insert with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- brand_kits
-- -----------------------------------------------------------------------------
create table if not exists public.brand_kits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  logo_url        text,
  palette         jsonb not null default '[]'::jsonb,
  fonts           jsonb not null default '{}'::jsonb,
  voice_rules     jsonb not null default '{}'::jsonb,
  do_not_use      jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists brand_kits_user_idx on public.brand_kits (user_id);

alter table public.brand_kits enable row level security;
create policy brand_kits_owner_all on public.brand_kits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- moderation_log
-- -----------------------------------------------------------------------------
create table if not exists public.moderation_log (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  user_id         uuid references auth.users(id) on delete set null,
  ip_hash         text,
  kind            text not null check (kind in ('prompt_firewall', 'image_moderation', 'output_sanitize')),
  verdict         text not null check (verdict in ('allow', 'warn', 'block')),
  reason          text,
  payload_excerpt text,
  metadata        jsonb not null default '{}'::jsonb
);
create index if not exists moderation_log_time_idx on public.moderation_log (occurred_at desc);

-- -----------------------------------------------------------------------------
-- published_views  (per-day rollup; daily cron aggregates from edge logs)
-- -----------------------------------------------------------------------------
create table if not exists public.published_views (
  slug          text not null,
  view_day      date not null,
  views         int not null default 0,
  unique_views  int not null default 0,
  primary key (slug, view_day)
);
create index if not exists published_views_slug_idx on public.published_views (slug);

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_kits_updated_at on public.brand_kits;
create trigger brand_kits_updated_at
  before update on public.brand_kits
  for each row execute function public.set_updated_at();
