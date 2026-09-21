-- Seven functions were callable by anyone holding the publishable key,
-- and one of them runs arbitrary SQL.
--
-- Found by an audit that went looking for more of the shape
-- 20260921040000 had just closed, on the theory that a project bitten
-- once by a PUBLIC grant has usually been bitten more than once. It had:
-- that migration fixed create_observation_candidate and these were
-- sitting beside it the whole time.
--
-- The serious one is execute_readonly_query. It is the chat's read tool
-- (0021), it takes a SQL string, and PUBLIC holds EXECUTE on it --
-- PostgREST exposes it at /rest/v1/rpc/execute_readonly_query, and
-- PUBLIC includes anon. Verified rather than inferred: running `set
-- local role anon`, a call enumerating information_schema.tables came
-- back with 21 rows.
--
-- RLS is why that is a disclosure rather than a breach. No producer row
-- comes back, because every policy still compares against a
-- current_producer_id() that is null for anon. What does come back is
-- pg_catalog and information_schema: every table and column, every
-- function body through pg_get_functiondef, and every policy expression
-- through pg_policy -- a complete map of the database and of the
-- defences protecting it. It is also an unmetered compute sink, five
-- seconds of database CPU per call by the function's own
-- statement_timeout, for anyone who wants it.
--
-- WHY NO ADVISOR CAUGHT THIS, which matters more than the fix. The
-- Supabase security advisor's anon-callable lint fires on SECURITY
-- DEFINER. Every function here is SECURITY INVOKER, so the lint cannot
-- see them, and Releases step 1's "check the advisors" would never have
-- surfaced it -- not this release, not any release. The advisor is a
-- backstop for one shape of this mistake, not for the mistake.
--
-- The other six fail closed today: anon has no SELECT on pending_writes
-- or audit_log, and a null producer matches nothing. That is the
-- function declining to be useful rather than a control, which is the
-- distinction 20260921040000 was written about, so they go with it.
--
-- public.rls_auto_enable() keeps its grant deliberately. It is Supabase's
-- own platform-injected event trigger, not this project's function, and
-- docs/monitoring.md records it as benign.

revoke execute on function public.execute_readonly_query(text) from public;
grant execute on function public.execute_readonly_query(text) to authenticated;

revoke execute on function public.propose_write_query(text) from public;
grant execute on function public.propose_write_query(text) to authenticated;

revoke execute on function public.confirm_write(uuid) from public;
grant execute on function public.confirm_write(uuid) to authenticated;

revoke execute on function public.revert_audit_entry(uuid) from public;
grant execute on function public.revert_audit_entry(uuid) to authenticated;

revoke execute on function public.search_memory_by_embedding(vector, integer) from public;
grant execute on function public.search_memory_by_embedding(vector, integer) to authenticated;

revoke execute on function public.parcel_lookup_counts(text) from public;
grant execute on function public.parcel_lookup_counts(text) to authenticated;

revoke execute on function public.variety_lookup_counts(text) from public;
grant execute on function public.variety_lookup_counts(text) to authenticated;
