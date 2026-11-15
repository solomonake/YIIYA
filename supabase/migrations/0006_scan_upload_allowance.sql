-- Prepare only: do not apply without reviewed deployment approval.
-- Per-job lifetime reservations, not a global spending cap. No automatic refunds:
-- a Blob timeout may have stored the file even when the response was lost.
create table public.scan_upload_allowances (
  session_id uuid primary key references public.scan_sessions(id) on delete cascade,
  reserved_files integer not null check (reserved_files between 1 and 12),
  reserved_bytes bigint not null check (reserved_bytes between 1 and 33554432)
);
alter table public.scan_upload_allowances enable row level security;
revoke all on table public.scan_upload_allowances from public, anon, authenticated;

-- Existing uploads consume allowance too; already-over-limit jobs are exhausted.
insert into public.scan_upload_allowances (session_id, reserved_files, reserved_bytes)
select session_id, least(count(*), 12)::integer,
       greatest(1, least(sum(greatest(coalesce(size_bytes, 0), 0)), 33554432))::bigint
from public.scan_uploads
group by session_id;

create function public.reserve_scan_upload(p_scan_id uuid, p_bytes bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  admitted boolean;
begin
  if p_scan_id is null or p_bytes is null or p_bytes < 1 or p_bytes > 3145728 then
    return false;
  end if;
  insert into public.scan_upload_allowances as allowance
    (session_id, reserved_files, reserved_bytes)
  select p_scan_id, 1, p_bytes
  where exists (
    select 1 from public.scan_jobs
    where session_id = p_scan_id and state = 'queued' and stage = 'capture'
  )
  on conflict (session_id) do update
    set reserved_files = allowance.reserved_files + 1,
        reserved_bytes = allowance.reserved_bytes + excluded.reserved_bytes
    where allowance.reserved_files < 12
      and allowance.reserved_bytes <= 33554432 - excluded.reserved_bytes
  returning true into admitted;
  return coalesce(admitted, false);
end;
$$;
revoke all on function public.reserve_scan_upload(uuid, bigint) from public, anon, authenticated;
grant execute on function public.reserve_scan_upload(uuid, bigint) to service_role;
