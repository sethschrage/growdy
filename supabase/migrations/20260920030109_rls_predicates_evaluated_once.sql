-- Every tenancy policy in this schema called a function with the row's
-- own column as its argument:
--
--   using (private.user_can_access_producer(producer_id))
--
-- which Postgres must evaluate once per row, and cannot inline, because
-- the function is SECURITY DEFINER with a SET clause. Measured on
-- weather_observations (143,588 rows): 1,500 ms to evaluate the
-- predicate alone, on the cheap path. The same test written so the
-- caller's producer is resolved once:
--
--   using (producer_id = (select private.current_producer_id()))
--
-- takes 15 ms and becomes an index condition rather than a filter. One
-- hundred times faster, and it is the difference between a weather
-- question answering in one model turn and hitting the 5-second
-- statement timeout in execute_readonly_query -- which is exactly what
-- happened on 2026-09-19: the first query timed out and the model spent
-- seven more turns working around it.
--
-- WHY THESE ARE THE SAME TEST. `private.user_can_access_producer(X)` is
-- `exists (select 1 from profiles where id = auth.uid() and producer_id
-- = X)`. `profiles.id` is the primary key, so a caller has at most one
-- profile row, and that exists() is true exactly when X equals that
-- row's producer_id. With no profile row the subquery returns null, `X =
-- null` is null, and the row is filtered -- the same answer the exists()
-- gives. The parcel and plot helpers are the same argument one and two
-- joins further out, rewritten as IN (subquery) so the inner set is
-- built once.
--
-- The helper functions stay. confirm_observation_candidate() and
-- get_decrypted_source_secret() call them once per statement, where a
-- function call is the right shape.
--
-- private.user_can_edit_parcel is dropped rather than rewritten: it
-- queries public.parcel_shares, which 0028 removed. Any UPDATE on
-- plot_rows has therefore been failing with "relation parcel_shares does
-- not exist" since that migration -- a policy nothing could satisfy.
-- With sharing gone, "editor or owner" is just owner.

create or replace function private.current_producer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select producer_id from public.profiles where id = auth.uid();
$$;

comment on function private.current_producer_id() is
  'The producer the caller belongs to, resolved once per statement. Every tenancy policy compares against this rather than calling a function per row -- see the migration that introduced it for the 1,500ms/15ms measurement.';

revoke execute on function private.current_producer_id() from public;
grant execute on function private.current_producer_id() to authenticated;

-- producers ------------------------------------------------------------
drop policy "producers: member can view their producer" on public.producers;
create policy "producers: member can view their producer"
  on public.producers for select
  using (id = (select private.current_producer_id()));

-- parcels --------------------------------------------------------------
drop policy "parcels: member can view producer's parcels" on public.parcels;
create policy "parcels: member can view producer's parcels"
  on public.parcels for select
  using (producer_id = (select private.current_producer_id()));

-- plots / plot_rows / planting: access still derives from the parcel, so
-- the rewrite walks the same hierarchy -- once, into a hashed set.
drop policy "plots: member can view producer's plots" on public.plots;
create policy "plots: member can view producer's plots"
  on public.plots for select
  using (parcel_id in (select id from public.parcels where producer_id = (select private.current_producer_id())));

drop policy "plot_rows: member can view producer's rows" on public.plot_rows;
create policy "plot_rows: member can view producer's rows"
  on public.plot_rows for select
  using (plot_id in (
    select pl.id from public.plots pl
    where pl.parcel_id in (select id from public.parcels where producer_id = (select private.current_producer_id()))
  ));

drop policy "plot_rows: editor or owner can update their producer's rows" on public.plot_rows;
create policy "plot_rows: member can update their producer's rows"
  on public.plot_rows for update
  using (plot_id in (
    select pl.id from public.plots pl
    where pl.parcel_id in (select id from public.parcels where producer_id = (select private.current_producer_id()))
  ))
  with check (plot_id in (
    select pl.id from public.plots pl
    where pl.parcel_id in (select id from public.parcels where producer_id = (select private.current_producer_id()))
  ));

drop policy "planting: member can view producer's plantings" on public.planting;
create policy "planting: member can view producer's plantings"
  on public.planting for select
  using (parcel_id in (select id from public.parcels where producer_id = (select private.current_producer_id())));

-- observations ---------------------------------------------------------
drop policy "observations: member can view producer's observations" on public.observations;
create policy "observations: member can view producer's observations"
  on public.observations for select
  using (
    producer_id = (select private.current_producer_id())
    or (
      planting_id is not null
      and planting_id in (
        select pl.id from public.planting pl
        where pl.parcel_id in (select id from public.parcels where producer_id = (select private.current_producer_id()))
      )
    )
  );

drop policy "observations: member can delete their producer's observations" on public.observations;
create policy "observations: member can delete their producer's observations"
  on public.observations for delete
  using (producer_id = (select private.current_producer_id()));

-- observation_candidates -----------------------------------------------
drop policy "observation_candidates: member can view their producer's candid" on public.observation_candidates;
create policy "observation_candidates: member can view their producer's candid"
  on public.observation_candidates for select
  using (producer_id = (select private.current_producer_id()));

drop policy "observation_candidates: member can review their producer's cand" on public.observation_candidates;
create policy "observation_candidates: member can review their producer's cand"
  on public.observation_candidates for update
  using (producer_id = (select private.current_producer_id()))
  with check (producer_id = (select private.current_producer_id()));

-- weather --------------------------------------------------------------
drop policy "weather_observations: member can view producer's readings" on public.weather_observations;
create policy "weather_observations: member can view producer's readings"
  on public.weather_observations for select
  using (producer_id = (select private.current_producer_id()));

drop policy "weather_observations: member can insert producer's readings" on public.weather_observations;
create policy "weather_observations: member can insert producer's readings"
  on public.weather_observations for insert
  with check (producer_id = (select private.current_producer_id()));

drop policy "weather_observations: member can update producer's observations" on public.weather_observations;
create policy "weather_observations: member can update producer's observations"
  on public.weather_observations for update
  using (producer_id = (select private.current_producer_id()))
  with check (producer_id = (select private.current_producer_id()));

-- data_sources ---------------------------------------------------------
drop policy "data_sources: member can view producer's sources" on public.data_sources;
create policy "data_sources: member can view producer's sources"
  on public.data_sources for select
  using (producer_id = (select private.current_producer_id()));

drop policy "data_sources: member can update producer's sources" on public.data_sources;
create policy "data_sources: member can update producer's sources"
  on public.data_sources for update
  using (producer_id = (select private.current_producer_id()))
  with check (producer_id = (select private.current_producer_id()));

drop policy "data_sources: member can delete producer's sources" on public.data_sources;
create policy "data_sources: member can delete producer's sources"
  on public.data_sources for delete
  using (producer_id = (select private.current_producer_id()));

-- conversations --------------------------------------------------------
drop policy "conversations: member can view producer's conversations" on public.conversations;
create policy "conversations: member can view producer's conversations"
  on public.conversations for select
  using (producer_id = (select private.current_producer_id()));

drop policy "conversations: member can start a conversation" on public.conversations;
create policy "conversations: member can start a conversation"
  on public.conversations for insert
  with check (producer_id = (select private.current_producer_id()));

drop policy "conversations: member can update producer's conversations" on public.conversations;
create policy "conversations: member can update producer's conversations"
  on public.conversations for update
  using (producer_id = (select private.current_producer_id()))
  with check (producer_id = (select private.current_producer_id()));

-- conversation_embeddings ----------------------------------------------
drop policy "conversation_embeddings: member can view their producer's embed" on public.conversation_embeddings;
create policy "conversation_embeddings: member can view their producer's embed"
  on public.conversation_embeddings for select
  using (producer_id = (select private.current_producer_id()));

-- producer_memory ------------------------------------------------------
drop policy "producer_memory: member can view their producer's memory" on public.producer_memory;
create policy "producer_memory: member can view their producer's memory"
  on public.producer_memory for select
  using (producer_id = (select private.current_producer_id()));

drop policy "producer_memory: member can create their own memory entries" on public.producer_memory;
create policy "producer_memory: member can create their own memory entries"
  on public.producer_memory for insert
  with check (producer_id = (select private.current_producer_id()));

drop policy "producer_memory: member can edit their own memory entries" on public.producer_memory;
create policy "producer_memory: member can edit their own memory entries"
  on public.producer_memory for update
  using (producer_id = (select private.current_producer_id()))
  with check (producer_id = (select private.current_producer_id()));

-- artifacts ------------------------------------------------------------
drop policy "artifacts: member can view their own producer's artifacts" on public.artifacts;
create policy "artifacts: member can view their own producer's artifacts"
  on public.artifacts for select
  using (producer_id = (select private.current_producer_id()));

drop policy "artifacts: member can create their own artifacts" on public.artifacts;
create policy "artifacts: member can create their own artifacts"
  on public.artifacts for insert
  with check (producer_id = (select private.current_producer_id()));

drop policy "artifacts: member can delete their own artifacts" on public.artifacts;
create policy "artifacts: member can delete their own artifacts"
  on public.artifacts for delete
  using (producer_id = (select private.current_producer_id()));

-- pending_writes -------------------------------------------------------
drop policy "pending_writes: member can view their producer's proposals" on public.pending_writes;
create policy "pending_writes: member can view their producer's proposals"
  on public.pending_writes for select
  using (producer_id = (select private.current_producer_id()));

drop policy "pending_writes: member can propose for their own producer" on public.pending_writes;
create policy "pending_writes: member can propose for their own producer"
  on public.pending_writes for insert
  with check (producer_id = (select private.current_producer_id()));

drop policy "pending_writes: member can update their producer's proposals" on public.pending_writes;
create policy "pending_writes: member can update their producer's proposals"
  on public.pending_writes for update
  using (producer_id = (select private.current_producer_id()));

-- audit_log ------------------------------------------------------------
drop policy "audit_log: member can view their producer's history" on public.audit_log;
create policy "audit_log: member can view their producer's history"
  on public.audit_log for select
  using (producer_id = (select private.current_producer_id()));

-- plant_types: the only one with a role of its own, kept exactly --------
drop policy "plant_types: canonical visible to all, pending/rejected visible" on public.plant_types;
create policy "plant_types: canonical visible to all, pending/rejected visible"
  on public.plant_types for select
  to authenticated
  using (
    status = 'canonical'
    or proposed_by_producer_id = (select private.current_producer_id())
  );

-- The function behind a policy that nothing could satisfy.
drop function if exists private.user_can_edit_parcel(uuid);
