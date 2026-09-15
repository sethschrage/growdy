-- Fix: CREATE FUNCTION grants EXECUTE to PUBLIC automatically unless
-- explicitly revoked -- a real Postgres default this project's earlier
-- functions never had to think about, since execute_readonly_query and
-- user_can_access_producer both already had this addressed (implicitly
-- for the latter, since it lives in a schema anon/authenticated have no
-- USAGE on beyond what's needed). add_data_source and
-- get_decrypted_source_secret (moved to public in 20260915034545) never
-- had the default PUBLIC grant revoked, so the security advisor correctly
-- flagged both as callable by `anon` -- an unauthenticated caller.
--
-- This isn't a real exposure: both functions check the caller's own
-- auth.uid() via private.user_can_access_producer() before doing anything
-- privileged, and auth.uid() is null for an anonymous caller, so the
-- check already fails safely. But there's no reason to leave an
-- unauthenticated caller able to invoke them at all -- revoking the
-- default PUBLIC grant is the correct, minimal fix, not a response to an
-- actual incident.
revoke execute on function public.add_data_source(uuid, text, text, text, jsonb, timestamptz) from public;
revoke execute on function public.get_decrypted_source_secret(uuid) from public;
