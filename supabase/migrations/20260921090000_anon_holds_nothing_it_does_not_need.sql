-- anon holds TRUNCATE on every table in the schema, and has since the
-- project was created.
--
-- Supabase's platform defaults grant ALL on public tables to anon and
-- authenticated. 20260913054119 added the SELECT/INSERT/UPDATE grants the
-- policies had been assuming; nothing ever revoked what was underneath.
-- Read off the live project, anon holds TRUNCATE, REFERENCES and TRIGGER
-- on all twenty relations in public, plus SELECT on app_status.
--
-- TRUNCATE is the one that matters, because RLS DOES NOT APPLY TO IT. A
-- truncate arriving as anon empties a table whatever the policies say,
-- and audit_row_change is a row-level trigger, so it would record
-- nothing at all. There would be no row left to say what happened.
--
-- Latent, not live: PostgREST has no TRUNCATE verb, execute_readonly_query
-- runs in a read-only transaction, and propose_write_query wraps the
-- statement it is given in `with t as (%s returning *)`, where TRUNCATE
-- does not parse. Four separate accidents are what stand between this and
-- an empty database, and none of them was put there for this reason. That
-- is not a control; it is luck with good posture.
--
-- app_status keeps its SELECT and is the only thing re-granted. It is the
-- maintenance flag, and app/src/app/App.tsx calls useAppStatus() before it
-- decides whether there is a session -- so a signed-out visitor polls it,
-- and taking that away would mean the maintenance screen could not be
-- shown to the people most likely to be looking at a broken app.
--
-- The default privileges go too, so the next table created does not
-- quietly inherit the same thing and put this back.

revoke all on all tables in schema public from anon;

grant select on public.app_status to anon;

alter default privileges in schema public revoke all on tables from anon;
