-- Both derived views defaulted to running with the privileges of
-- their owner rather than the querying user, which the Supabase
-- security advisor flags as SECURITY DEFINER: a view owned by an
-- elevated role would evaluate row-level security using the owner's
-- visibility, not the actual caller's, silently bypassing RLS on the
-- underlying tables. security_invoker makes each view check RLS as
-- the querying user instead, matching every other table's behavior.
alter view public.planting_readable set (security_invoker = true);
alter view public.position_status set (security_invoker = true);
