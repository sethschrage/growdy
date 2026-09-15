-- Companion to the grant fix in weather_observations_update_grant: RLS is
-- enabled on weather_observations with no update policy at all (the
-- original design's "append-only, like observations" framing), but
-- 0019's own idempotency design ("every write is an upsert... invoke
-- ingest-weather twice for an overlapping window and confirm no
-- duplicate rows") requires ON CONFLICT DO UPDATE to actually succeed
-- for authenticated, not just be grantable -- RLS with no matching
-- policy denies by default regardless of the base GRANT. service_role
-- bypasses RLS entirely (bypassrls=true) so this specific policy isn't
-- what fixes sync-scheduled-weather, but leaving authenticated with a
-- structurally-required-but-always-denied UPDATE would be the same class
-- of latent bug, just waiting for the next real overlapping resync to
-- surface it.
create policy "weather_observations: member can update producer's observations"
  on public.weather_observations for update
  using (private.user_can_access_producer(producer_id))
  with check (private.user_can_access_producer(producer_id));
