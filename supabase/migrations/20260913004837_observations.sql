-- An observation is a dated note about a specific planting -- always
-- linked to the planting (not a bare position), so history stays correct
-- across replanting. Append-only by discipline: a correction should add
-- a new observation, never edit or delete an old one. No schema-level
-- "supersedes" link yet -- nothing has needed one; add it if/when a real
-- correction case shows up.
--
-- note is deliberately free text, not yet split into structured fields
-- (e.g. a numeric vigor score), even though some recurring patterns (e.g.
-- "Potentially Low") look like they might eventually deserve one. Real
-- import data goes in as plain text now; promoting a pattern to a real
-- structured field is a later migration once it's clear it's worth it,
-- not a decision to make speculatively today. See docs/decisions/0005.
--
-- observed_date is nullable and distinct from created_at: observed_date
-- is when the observation actually happened in the field (often long
-- before the row is entered); created_at is bookkeeping for when the row
-- was written to this database. Nullable rather than forced to a
-- guessed value, so "we don't actually know the date" can be represented
-- honestly instead of papered over.
--
-- photo_metadata holds raw EXIF/XMP text for an observation that came
-- with a photo, when available -- preserved as-is for now rather than
-- parsed into structured columns (a real location point, a verified
-- capture date). This is the same discipline as note: keep full raw
-- fidelity now, extract real structure only once it's clear what's
-- actually needed.

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  planting_id uuid not null references public.planting (id),
  producer_id uuid not null references public.producers (id),
  observed_date date,
  note text not null,
  photo_metadata text,
  created_at timestamptz not null default now()
);

comment on table public.observations is 'A dated note about a specific planting. Append-only -- corrections add a new row, never edit or delete an old one.';
comment on column public.observations.observed_date is 'When the observation actually happened in the field. Nullable -- honestly unknown is better than a guessed placeholder date.';
comment on column public.observations.photo_metadata is 'Raw EXIF/XMP text from an accompanying photo, if any -- preserved as-is, not yet parsed into structured columns.';

create index observations_producer_id_idx on public.observations (producer_id);
create index observations_planting_id_idx on public.observations (planting_id, observed_date);

alter table public.observations enable row level security;

create policy "observations: member can view producer's observations"
  on public.observations for select
  using (private.user_can_access_producer(producer_id));
