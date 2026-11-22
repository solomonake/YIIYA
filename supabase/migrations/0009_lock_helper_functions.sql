-- Security advisor fixes (2026-11-22). Not applied automatically: run with
-- `supabase db push` or the SQL editor after review.
--
-- 1. rls_auto_enable() is an event-trigger helper. Event triggers run it
--    without checking EXECUTE, so nobody needs to call it over the API.
--    Removing EXECUTE from public, anon and authenticated closes the
--    /rest/v1/rpc/rls_auto_enable entry point the advisor flags.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2. set_updated_at() had a role-mutable search_path. now() resolves from
--    pg_catalog, which is always searched, so an empty path is safe.
alter function public.set_updated_at() set search_path = '';
