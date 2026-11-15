-- Memory retrieval is called only by lib/memory/episodic.ts via serviceClient().
-- SECURITY DEFINER plus caller-controlled p_user must not be exposed to browsers.
revoke all on function public.episodic_match(uuid, public.vector, integer)
  from public, anon, authenticated;
grant execute on function public.episodic_match(uuid, public.vector, integer) to service_role;
