-- Run after migration 0008. No customer rows are read: NULL user matches none.
begin;
do $$
declare denied boolean := false; matches bigint;
begin
  assert not has_function_privilege('anon','public.episodic_match(uuid,public.vector,integer)','EXECUTE');
  assert not has_function_privilege('authenticated','public.episodic_match(uuid,public.vector,integer)','EXECUTE');
  assert has_function_privilege('service_role','public.episodic_match(uuid,public.vector,integer)','EXECUTE');
  set local role anon;
  begin
    perform * from public.episodic_match(null::uuid,null::public.vector,1);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  assert denied, 'Anonymous RPC invocation was not denied';
  denied := false;
  set local role authenticated;
  begin
    perform * from public.episodic_match(null::uuid,null::public.vector,1);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  assert denied, 'Authenticated browser RPC invocation was not denied';
  set local role service_role;
  select count(*) into matches from public.episodic_match(null::uuid,null::public.vector,1);
  reset role;
  assert matches=0, 'NULL-user verification must not return rows';
end $$;
rollback;
