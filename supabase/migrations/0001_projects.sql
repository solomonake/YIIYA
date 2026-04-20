-- Yiiya production schema v2.
-- This migration intentionally clean-replaces legacy project storage.

create extension if not exists "pgcrypto";

drop table if exists public.published_projects cascade;
drop table if exists public.projects cascade;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_name text not null default 'untitled project',
  canvas_json jsonb not null default '{"sections":[],"sceneObjects":[],"layers":[]}'::jsonb,
  theme_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.published_projects (
  slug text primary key,
  user_id uuid references auth.users(id) on delete set null,
  canvas_json jsonb not null default '{"sections":[],"sceneObjects":[],"layers":[]}'::jsonb,
  theme_json jsonb not null default '{}'::jsonb,
  html_snapshot text not null default '',
  scene_json jsonb not null default '{}'::jsonb,
  react_export text not null default '',
  created_at timestamptz not null default now()
);

create index projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

create index published_projects_user_created_idx
  on public.published_projects (user_id, created_at desc);

alter table public.projects enable row level security;
alter table public.published_projects enable row level security;

create policy "users own projects"
  on public.projects
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users own published"
  on public.published_projects
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "published projects are readable"
  on public.published_projects
  for select
  using (true);
