-- Fix: private.add_data_source / private.get_decrypted_source_secret
-- (20260915033821) were placed in the private schema by copying
-- private.user_can_access_producer's placement -- but that function is
-- only ever called from inside an RLS policy expression, at the SQL
-- level, never over RPC. These two need to be called by the ingest-weather
-- Edge Function via supabase.rpc(...), the same way chat already calls
-- execute_readonly_query. supabase/config.toml only exposes public and
-- graphql_public over the REST API -- private isn't reachable via .rpc()
-- at all, so as originally written these were simply uncallable from
-- where they're actually needed.
--
-- A plain schema move, not a redefinition: ALTER FUNCTION ... SET SCHEMA
-- preserves the function body, its existing grants, and its comment
-- (all tied to the object's OID, not its schema-qualified name) -- moving
-- to public matches where execute_readonly_query already lives, for the
-- same reason.
alter function private.add_data_source(uuid, text, text, text, jsonb, timestamptz) set schema public;
alter function private.get_decrypted_source_secret(uuid) set schema public;
