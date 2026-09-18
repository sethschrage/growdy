-- Every observation will enter through review, including ones the
-- producer typed themselves. That reverses part of `0028`, which removed
-- the review gate three migrations ago, so it has to be exact about what
-- is being reinstated and what is not.
--
-- `0028`'s complaint was not that review is wrong. It was that the gate
-- had no gatekeeper: `observations.status` existed with no UPDATE grant
-- and no UPDATE policy, so nothing in the app or the chat could move a
-- row from 'pending' to 'approved'. A real field note logged through the
-- chat would have sat pending forever. That criticism stands, and
-- re-adding a status column to `observations` would rebuild the same
-- trap.
--
-- So the gate is not going back on `observations`. It goes where a
-- working one already exists: `observation_candidates` has `status` and
-- `reviewed_at`, the app already reviews it, and confirming a candidate
-- already produces an observation. `observations` keeps its current
-- meaning -- rows that count -- and the queue becomes the only way in.
--
-- The reason is curation rather than correctness. Observations feed
-- producer memory, memory is recalled when the chat interprets the next
-- photo or question, and an unreviewed record quietly teaches itself
-- back to the producer. That argument is strongest for anything a model
-- authored and weakest for a note the producer typed, since they are the
-- ground truth for their own vineyard -- but a deliberate pass over what
-- enters the permanent record was wanted for both. Recorded as a choice,
-- not as a safety property.
--
-- This migration only expands: it widens the queue so every source can
-- use it, and adds the two RPCs the app will call. Nothing is revoked
-- here. `observations` keeps its INSERT grant until every caller has
-- moved over, so no write path breaks midway through the sequence.

-- A producer-typed note has no conversation behind it, and neither does
-- a photo taken from the observation form rather than from chat.
alter table public.observation_candidates alter column conversation_id drop not null;

-- `summary` stays what it always was: the one-line label the queue
-- renders. These carry what the observation itself needs, so confirming
-- can build a real row instead of copying a summary into `note` and
-- losing the rest (which is what the client does today).
alter table public.observation_candidates
  add column if not exists note text,
  add column if not exists observed_date date,
  add column if not exists planting_id uuid references public.planting(id) on delete set null,
  add column if not exists photo_path text,
  add column if not exists source text not null default 'chat_scan';

-- Named sources rather than a boolean, because "who proposed this" is
-- what decides how much scrutiny a row deserves at review time, and
-- there are already three answers.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'observation_candidates_source_check'
  ) then
    alter table public.observation_candidates
      add constraint observation_candidates_source_check
      check (source in ('chat_scan', 'photo', 'producer', 'chat_tool'));
  end if;
end $$;

comment on column public.observation_candidates.note is 'The observation text this becomes when confirmed. Falls back to summary when null, which is how rows created before this migration behave.';
comment on column public.observation_candidates.photo_path is 'Storage object path for a photo candidate. The photo is the evidence; note holds what the model read from it.';
comment on column public.observation_candidates.source is 'Which path proposed this: chat_scan (the 6h scanner), photo (an image analysed at upload), producer (typed directly), chat_tool (0022 write tool).';

-- Confirming used to be two client statements -- insert the observation,
-- then mark the candidate -- with nothing holding them together. A
-- failure between them left an observation whose candidate still read
-- pending, so confirming again produced a duplicate. One function, one
-- transaction, and the duplicate is gone.
create or replace function public.confirm_observation_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_candidate public.observation_candidates;
  v_observation_id uuid;
begin
  select * into v_candidate
  from public.observation_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'Candidate not found';
  end if;

  if not private.user_can_access_producer(v_candidate.producer_id) then
    raise exception 'Not your producer''s candidate';
  end if;

  -- Idempotent rather than an error: a double-tap on a slow connection
  -- should be a no-op, not a failure the producer has to interpret.
  if v_candidate.status <> 'pending' then
    return null;
  end if;

  insert into public.observations (producer_id, conversation_id, planting_id, observed_date, note, photo_metadata)
  values (
    v_candidate.producer_id,
    v_candidate.conversation_id,
    v_candidate.planting_id,
    v_candidate.observed_date,
    coalesce(v_candidate.note, v_candidate.summary),
    v_candidate.photo_path
  )
  returning id into v_observation_id;

  update public.observation_candidates
  set status = 'confirmed', reviewed_at = now()
  where id = p_candidate_id;

  return v_observation_id;
end;
$$;

revoke all on function public.confirm_observation_candidate(uuid) from public;
grant execute on function public.confirm_observation_candidate(uuid) to authenticated;

-- The way every non-scanner path will propose an observation. Takes the
-- producer from the caller's profile rather than an argument, so a
-- caller cannot file a candidate against somebody else's producer.
create or replace function public.create_observation_candidate(
  p_summary text,
  p_note text default null,
  p_observed_date date default null,
  p_planting_id uuid default null,
  p_photo_path text default null,
  p_conversation_id uuid default null,
  p_source text default 'producer'
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_producer_id uuid;
  v_candidate_id uuid;
begin
  select producer_id into v_producer_id
  from public.profiles
  where id = auth.uid();

  if v_producer_id is null then
    raise exception 'No producer for this user';
  end if;

  if p_summary is null or length(trim(p_summary)) = 0 then
    raise exception 'A candidate needs a summary';
  end if;

  insert into public.observation_candidates
    (producer_id, conversation_id, summary, note, observed_date, planting_id, photo_path, source)
  values
    (v_producer_id, p_conversation_id, trim(p_summary), p_note, p_observed_date, p_planting_id, p_photo_path, p_source)
  returning id into v_candidate_id;

  return v_candidate_id;
end;
$$;

revoke all on function public.create_observation_candidate(text, text, date, uuid, text, uuid, text) from public;
grant execute on function public.create_observation_candidate(text, text, date, uuid, text, uuid, text) to authenticated;

comment on table public.observation_candidates is 'The review queue every observation passes through before it counts. Confirming one writes an observation; see docs/decisions/0030 and the amendment it makes to 0028.';
