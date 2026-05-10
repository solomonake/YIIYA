create table if not exists public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  prompt_hint text,
  object_hint text,
  desktop_url text not null,
  mobile_url text not null,
  capture_status text not null default 'waiting',
  coverage_json jsonb not null default '[]'::jsonb,
  latest_frame_json jsonb,
  warning_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.scan_sessions(id) on delete cascade,
  state text not null default 'queued',
  stage text not null default 'capture',
  progress numeric(5,2) not null default 0,
  retries integer not null default 0,
  worker text,
  worker_job_id text,
  fal_request_id text,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_uploads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  upload_kind text not null,
  file_name text not null,
  url text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  source_device text not null default 'mobile',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  job_id uuid references public.scan_jobs(id) on delete cascade,
  asset_kind text not null,
  label text not null,
  file_name text not null,
  url text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_exports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  job_id uuid references public.scan_jobs(id) on delete cascade,
  tier text not null,
  file_format text not null,
  status text not null default 'pending',
  file_name text not null,
  url text,
  size_bytes bigint,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scan_sessions_owner_updated_idx
  on public.scan_sessions (owner_id, updated_at desc);

create index if not exists scan_uploads_session_created_idx
  on public.scan_uploads (session_id, created_at desc);

create index if not exists scan_assets_session_created_idx
  on public.scan_assets (session_id, created_at desc);

create index if not exists scan_exports_session_updated_idx
  on public.scan_exports (session_id, updated_at desc);

alter table public.scan_sessions enable row level security;
alter table public.scan_jobs enable row level security;
alter table public.scan_uploads enable row level security;
alter table public.scan_assets enable row level security;
alter table public.scan_exports enable row level security;

create policy "users own scan sessions"
  on public.scan_sessions
  for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "users own scan jobs"
  on public.scan_jobs
  for all
  to authenticated
  using (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_jobs.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_jobs.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  );

create policy "users own scan uploads"
  on public.scan_uploads
  for all
  to authenticated
  using (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_uploads.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_uploads.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  );

create policy "users own scan assets"
  on public.scan_assets
  for all
  to authenticated
  using (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_assets.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_assets.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  );

create policy "users own scan exports"
  on public.scan_exports
  for all
  to authenticated
  using (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_exports.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scan_sessions
      where scan_sessions.id = scan_exports.session_id
        and scan_sessions.owner_id = auth.uid()
    )
  );
