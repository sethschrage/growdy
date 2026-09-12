-- A parcel is the top-level piece of land a producer owns/leases -- a real,
-- distinct unit (never spanning multiple producers, and a plot never spans
-- multiple parcels). No boundary/geometry column yet: nothing needs spatial
-- data until an actual location-bearing entity (a planting, an image
-- extent) requires it.

create table public.parcels (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.parcels is 'A distinct piece of land owned/leased by a producer.';

create index parcels_producer_id_idx on public.parcels (producer_id);

alter table public.parcels enable row level security;

create policy "parcels: member can view producer's parcels"
  on public.parcels for select
  using (private.user_can_access_producer(producer_id));
