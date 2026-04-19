-- Yiiya schema version 0001
-- Durable project publishing foundation.

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  owner_id uuid references auth.users(id) on delete set null,
  content_json jsonb not null default '{}'::jsonb,
  theme_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_id_created_at_idx
  on public.projects (owner_id, created_at desc);

create index if not exists projects_content_json_gin_idx
  on public.projects using gin (content_json);

alter table public.projects enable row level security;

drop policy if exists "Public projects are readable by slug" on public.projects;
create policy "Public projects are readable by slug"
  on public.projects
  for select
  using (true);

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
