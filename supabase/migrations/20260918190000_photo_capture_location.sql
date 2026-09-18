-- Where a photo was taken, kept separately from what it is about.
--
-- Those are two different facts and it took a wrong answer to see it.
-- `planting_id` says which vine an observation concerns; this says where
-- the camera was standing. They are not the same point -- a producer at
-- the end of a row photographs a vine several metres away -- and more
-- importantly, most photos will never have a planting attached at all. A
-- shot of weed pressure across a block, of standing water, of equipment,
-- of something odd at the fence line: none of those are about one
-- identifiable vine, and for every one of them the capture position is
-- the only spatial fact that will ever exist.
--
-- geography(Point, 4326) to match `planting.location` exactly, so the
-- two can be compared, joined and rendered without a projection step
-- between them.
--
-- This also makes a map possible now rather than later. Plotting
-- observations has been waiting on coordinates for 3,004 plantings that
-- are all still NULL; photos carry their own from the first one taken.
alter table public.observation_candidates
  add column if not exists photo_location geography(Point, 4326),
  add column if not exists photo_location_accuracy_m real;

alter table public.observations
  add column if not exists photo_location geography(Point, 4326),
  add column if not exists photo_location_accuracy_m real;

-- Accuracy travels with the point because it varies by an order of
-- magnitude and the difference matters. A 5m fix places a photo in a
-- block; a 65m fix, which is what a phone returns under canopy or
-- indoors, does not place it in a row and should not be drawn as though
-- it does. Storing the number means a map can decide; discarding it
-- would make every point look equally certain.
comment on column public.observation_candidates.photo_location is 'Where the camera was when the photo was taken -- device position for a capture, EXIF GPS for a library photo. Distinct from planting_id, which is what the photo is about.';
comment on column public.observation_candidates.photo_location_accuracy_m is 'Reported horizontal accuracy in metres. Varies from ~5m in the open to ~65m under canopy; a renderer should weight or hide a point accordingly rather than treating all of them alike.';
comment on column public.observations.photo_location is 'Where the camera was when the photo was taken -- device position for a capture, EXIF GPS for a library photo. Distinct from planting_id, which is what the photo is about.';
comment on column public.observations.photo_location_accuracy_m is 'Reported horizontal accuracy in metres. Varies from ~5m in the open to ~65m under canopy; a renderer should weight or hide a point accordingly rather than treating all of them alike.';

create index if not exists observations_photo_location_idx
  on public.observations using gist (photo_location);

-- Both RPCs gain the coordinates. Adding parameters to the existing
-- functions would create an overload rather than replace them, and
-- PostgREST resolves an overloaded name by the argument set it is given
-- -- which is exactly the kind of ambiguity that fails at runtime rather
-- than at deploy. Dropped and recreated instead.
drop function if exists public.create_observation_candidate(text, text, date, uuid, text, uuid, text);

create function public.create_observation_candidate(
  p_summary text,
  p_note text default null,
  p_observed_date date default null,
  p_planting_id uuid default null,
  p_photo_path text default null,
  p_conversation_id uuid default null,
  p_source text default 'producer',
  p_photo_latitude double precision default null,
  p_photo_longitude double precision default null,
  p_photo_accuracy_m real default null
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
    (producer_id, conversation_id, summary, note, observed_date, planting_id, photo_path, source,
     photo_location, photo_location_accuracy_m)
  values
    (v_producer_id, p_conversation_id, trim(p_summary), p_note, p_observed_date, p_planting_id, p_photo_path, p_source,
     case
       when p_photo_latitude is null or p_photo_longitude is null then null
       else st_setsrid(st_makepoint(p_photo_longitude, p_photo_latitude), 4326)::geography
     end,
     p_photo_accuracy_m)
  returning id into v_candidate_id;

  return v_candidate_id;
end;
$$;

revoke all on function public.create_observation_candidate(text, text, date, uuid, text, uuid, text, double precision, double precision, real) from public;
grant execute on function public.create_observation_candidate(text, text, date, uuid, text, uuid, text, double precision, double precision, real) to authenticated;

-- Confirming carries the coordinates across with everything else.
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

  if v_candidate.status <> 'pending' then
    return null;
  end if;

  insert into public.observations
    (producer_id, conversation_id, planting_id, observed_date, note, photo_metadata,
     photo_location, photo_location_accuracy_m)
  values (
    v_candidate.producer_id,
    v_candidate.conversation_id,
    v_candidate.planting_id,
    v_candidate.observed_date,
    coalesce(v_candidate.note, v_candidate.summary),
    v_candidate.photo_path,
    v_candidate.photo_location,
    v_candidate.photo_location_accuracy_m
  )
  returning id into v_observation_id;

  update public.observation_candidates
  set status = 'confirmed', reviewed_at = now()
  where id = p_candidate_id;

  return v_observation_id;
end;
$$;
