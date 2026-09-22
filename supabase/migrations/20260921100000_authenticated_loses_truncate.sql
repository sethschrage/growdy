-- authenticated loses TRUNCATE, REFERENCES and TRIGGER on every table.
--
-- 20260921090000 did this for anon and deliberately stopped there, with
-- the reason recorded in docs/monitoring.md: anon needed exactly one
-- grant kept, so the rest could go in a line, while authenticated is the
-- role the whole app runs as and a blanket `revoke all` would take with
-- it every grant the policies assume.
--
-- This is the narrow version, which has no such problem. Read off the
-- live project, every table carries the same three from Supabase's
-- platform default -- TRUNCATE, REFERENCES, TRIGGER, sixty grants across
-- twenty relations -- on top of a deliberate set that differs per table:
-- conversations has INSERT and UPDATE, data_sources has UPDATE and
-- DELETE, weather_observations has INSERT and UPDATE, pending_writes and
-- producer_memory have INSERT, observations has DELETE, and the rest have
-- SELECT alone. Naming the three rather than saying `all` leaves every
-- one of those untouched.
--
-- TRUNCATE is the one that matters, and it matters more for this role
-- than it did for anon, because authenticated is a role the app actually
-- hands out. RLS DOES NOT APPLY TO TRUNCATE: a truncate arriving as
-- authenticated empties a table whatever the policies say, and
-- audit_row_change is a row-level trigger, so there would be no row left
-- to record that anything happened.
--
-- Still latent rather than live, for the same three reasons as anon's:
-- PostgREST has no TRUNCATE verb, execute_readonly_query runs in a
-- read-only transaction, and propose_write_query wraps the statement it
-- is given in `with t as (%s returning *)`, where TRUNCATE does not
-- parse. None of those was put there for this reason, which is why they
-- are not a control.
--
-- Verified in a rolled-back transaction before this was written: after
-- the revoke, zero dangerous grants remain and every deliberate grant
-- above still answers true.
--
-- The default privileges take the same three and no more, so a table
-- created by a later migration does not inherit them -- while whatever
-- else the platform grants a new table stays as it is, which is not this
-- migration's argument to have.

revoke truncate, references, trigger on all tables in schema public from authenticated;

alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated;
