-- =============================================================================
-- 0004_episodic_match_rpc.sql
-- =============================================================================
-- RPC used by lib/memory/episodic.ts retrieveSimilar() to find top-K
-- cosine-similar past episodes for a user.
-- =============================================================================

create or replace function public.episodic_match(
  p_user uuid,
  p_query vector(768),
  p_limit int default 5
)
returns table (
  id uuid,
  occurred_at timestamptz,
  event_kind text,
  prompt_text text,
  resolved_intent jsonb,
  outcome text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.occurred_at,
    e.event_kind,
    e.prompt_text,
    e.resolved_intent,
    e.outcome,
    1 - (e.embedding <=> p_query) as similarity
  from public.episodic_memory e
  where e.user_id = p_user
    and e.embedding is not null
  order by e.embedding <=> p_query
  limit greatest(1, least(p_limit, 25));
$$;

grant execute on function public.episodic_match(uuid, vector(768), int) to authenticated, service_role;
