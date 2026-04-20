-- Yiiya schema version 0001
-- Durable project publishing foundation.

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_name text not null default 'untitled project',
  canvas_json jsonb not null default '{}'::jsonb,
  theme_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  slug text unique,
  owner_id uuid references auth.users(id) on delete set null,
  content_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.projects
  alter column slug drop not null,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists project_name text not null default 'untitled project',
  add column if not exists canvas_json jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists projects_user_id_updated_at_idx
  on public.projects (user_id, updated_at desc);

create index if not exists projects_content_json_gin_idx
  on public.projects using gin (content_json);

alter table public.projects enable row level security;

drop policy if exists "Public projects are readable by slug" on public.projects;
create policy "Public projects are readable by slug"
  on public.projects
  for select
  using (slug is not null and content_json->>'draft' = 'false');

drop policy if exists "Users can read their own projects" on public.projects;
create policy "Users can read their own projects"
  on public.projects
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert their own projects" on public.projects;
create policy "Users can insert their own projects"
  on public.projects
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Authenticated users can create owned projects" on public.projects;
create policy "Authenticated users can create owned projects"
  on public.projects
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update projects" on public.projects;
create policy "Owners can update projects"
  on public.projects
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Owners can delete projects" on public.projects;
create policy "Owners can delete projects"
  on public.projects
  for delete
  to authenticated
  using (owner_id = auth.uid());
