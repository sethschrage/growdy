-- Purpose: So a producer standing in a block with no signal can record
--   what they see and have it arrive later, without the flush that
--   delivers it ever filing the same observation twice. Answered with
--   the producer: the guard is against a replay -- a flush interrupted
--   half way, an app killed mid-upload -- not against two devices
--   inventing the same id, which 122 random bits already rules out.
-- Columns: client_id -- the identifier the capturing device mints for an
--   observation before it has ever spoken to the server. Null on every
--   row created before the queue existed, which reads correctly as
--   "filed directly". Not null is deliberately NOT enforced: these rows
--   are the historical record of how it used to work.
-- Relations: None, and that is the point. A client id refers to nothing
--   on this side -- it is minted on a phone that has never reached the
--   server -- so there is nothing for a foreign key to point at. What it
--   needs is uniqueness, which it gets globally rather than per
--   producer: global is simpler and strictly stronger, and two producers
--   minting the same v4 UUID is not a thing that happens.
-- Access: Inherited. observation_candidates' existing producer check
--   covers this column like every other, and nothing about a client id
--   changes who may see the row.
-- Chat: Described, unavoidably -- the prompt describes whole relations
--   and this table is one the model needs. So the comment says plainly
--   that it is plumbing, because the alternative is the model inventing
--   a meaning for a column nobody explained.
-- Backfill: None. Existing rows stay null.

alter table public.observation_candidates
  add column client_id uuid;

comment on column public.observation_candidates.client_id is
  'Plumbing, not vineyard data: the id the capturing device minted for this observation before it reached the server, so a queued capture delivered twice files once. Null on rows created before the offline queue existed. Nothing to analyse here.';

create unique index observation_candidates_client_id_key
  on public.observation_candidates (client_id);

-- And the door the queue delivers through. Same function, one more
-- argument, and the replay it exists to absorb: a candidate whose client
-- id is already filed returns that row's id and inserts nothing, so a
-- flush interrupted half way costs a duplicate request rather than a
-- duplicate observation. Deliberately not "on conflict do nothing" alone
-- -- the caller needs the id back either way, or it cannot tell a
-- successful replay from a failure and will keep trying forever.
create or replace function public.create_observation_candidate(
  p_summary text,
  p_note text default null::text,
  p_observed_date date default null::date,
  p_planting_id uuid default null::uuid,
  p_photo_path text default null::text,
  p_conversation_id uuid default null::uuid,
  p_source text default 'producer'::text,
  p_photo_latitude double precision default null::double precision,
  p_photo_longitude double precision default null::double precision,
  p_photo_accuracy_m real default null::real,
  p_client_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
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

  -- The replay. Scoped to the caller's own producer as well as the id:
  -- the unique index already makes a cross-producer collision
  -- impossible, and checking both means a stray id can never hand back
  -- somebody else's row.
  if p_client_id is not null then
    select id into v_candidate_id
    from public.observation_candidates
    where client_id = p_client_id
      and producer_id = v_producer_id;

    if v_candidate_id is not null then
      return v_candidate_id;
    end if;
  end if;

  insert into public.observation_candidates
    (producer_id, conversation_id, summary, note, observed_date, planting_id, photo_path, source,
     photo_location, photo_location_accuracy_m, client_id)
  values
    (v_producer_id, p_conversation_id, trim(p_summary), p_note, p_observed_date, p_planting_id, p_photo_path, p_source,
     case
       when p_photo_latitude is null or p_photo_longitude is null then null
       else extensions.st_setsrid(
              extensions.st_makepoint(p_photo_longitude, p_photo_latitude), 4326
            )::extensions.geography
     end,
     p_photo_accuracy_m, p_client_id)
  returning id into v_candidate_id;

  return v_candidate_id;
end;
$function$;
