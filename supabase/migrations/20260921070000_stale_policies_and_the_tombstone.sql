-- Two policies that outlived what they were for.
--
-- FIRST: observations is the one producer table whose read rule is not
-- "producer_id is the tenancy key". Its SELECT policy carries a second
-- branch --
--
--   OR (planting_id is not null AND planting_id in (
--         select pl.id from planting pl
--          where pl.parcel_id in (select id from parcels
--                                  where producer_id = current_producer_id())))
--
-- -- which was added by 20260916185426_parcel_sharing.sql so a producer
-- who had been given a parcel could read observations recorded against
-- plantings in it. 20260918022000 deleted parcel sharing and stripped
-- the share branch out of private.user_can_access_parcel; it did not
-- touch this one. 20260920030109 then rewrote every policy into the
-- InitPlan shape mechanically and carried the dead branch forward
-- intact, because rewriting a predicate for speed does not ask what it
-- is for.
--
-- Not exploitable today: create_observation_candidate sets producer_id
-- from auth.uid() and confirm_observation_candidate copies it, so a
-- row's producer and its planting's parcel always agree. It is latent,
-- and 0028's "growdy will sell parcels, and the parcel is the seat" is
-- precisely the moment it stops being. A row owned by producer A is
-- readable by producer B for as long as it points at a planting under
-- B's parcel. The DELETE policy beside it is already the plain rule,
-- which is the tell.

alter policy "observations: member can view producer's observations"
  on public.observations
  using (producer_id = (select private.current_producer_id()));

-- SECOND: artifacts_deprecated is a tombstone with a live write surface.
--
-- 20260921044806 renamed the table rather than dropping it, because
-- CONTRIBUTING requires that of a drop that would destroy real data, and
-- its comment says "Nothing reads it." True of reads. The grants and the
-- three policies rode along with the rename, so `authenticated` still
-- holds INSERT, DELETE and TRUNCATE on it and all three
-- "artifacts: member can ..." policies are still attached.
--
-- The chat's prompt hides the table from the model
-- (supabase/functions/chat/index.ts), but propose_write_query takes
-- free-form SQL, so the description being absent is not the control.
-- The rename rule protects the rows; it does not ask anyone to keep the
-- door open. Two dead rows should be waiting out their window behind a
-- table nothing can write to.

drop policy if exists "artifacts: member can create their own artifacts" on public.artifacts_deprecated;
drop policy if exists "artifacts: member can delete their own artifacts" on public.artifacts_deprecated;
drop policy if exists "artifacts: member can view their own producer's artifacts" on public.artifacts_deprecated;

revoke all on public.artifacts_deprecated from anon, authenticated;
