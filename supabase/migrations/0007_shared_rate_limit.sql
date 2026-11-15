-- Atomic rolling-window fallback using the existing service-only ledger.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

create function public.consume_rate_limit(
  p_name text, p_identity_hash text, p_tokens integer, p_window_ms integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
  v_now timestamptz;
  v_window interval;
  v_count bigint;
  v_oldest timestamptz;
  v_success boolean;
begin
  if p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$'
     or p_name is null or p_tokens is null or p_window_ms is null
     or not (
       (p_name = 'interpret' and p_tokens = 30 and p_window_ms = 300000)
       or (p_name = 'generate3d' and p_tokens between 1 and 1000 and p_window_ms = 86400000)
       or (p_name = 'publish' and p_tokens = 20 and p_window_ms = 3600000)
     ) then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;
  v_key := 'yiiya:rl:' || p_name || ':' || p_identity_hash;
  -- All transactions for one identity/limiter serialize, including cold starts.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));
  v_now := pg_catalog.clock_timestamp();
  v_window := p_window_ms * interval '1 millisecond';
  delete from public.rate_limits where key = v_key and window_start <= v_now - v_window;
  select coalesce(sum(count), 0), min(window_start) into v_count, v_oldest
    from public.rate_limits where key = v_key;
  v_success := v_count < p_tokens;
  if v_success then
    insert into public.rate_limits as ledger (key, window_start, count)
      values (v_key, v_now, 1)
      on conflict (key, window_start) do update set count = ledger.count + 1;
    v_count := v_count + 1;
    v_oldest := coalesce(v_oldest, v_now);
  end if;
  -- Bounded cleanup of unused identities. Every allowed window is <= 24 hours.
  delete from public.rate_limits where (key, window_start) in (
    select key, window_start from public.rate_limits
    where window_start < v_now - interval '25 hours'
    order by window_start limit 100 for update skip locked
  );
  return jsonb_build_object('success', v_success, 'remaining', greatest(0, p_tokens-v_count),
    'limit', p_tokens, 'reset', ceil(extract(epoch from (v_oldest+v_window))*1000)::bigint);
end;
$$;
revoke all on function public.consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;
