-- A planting is one specific plant's occupancy of a place, from
-- planted_date to (nullable) removed_date. It is NOT a permanent "plant"
-- record -- replacing what's at a position means closing out the old
-- planting (set removed_date) and inserting a new one; nothing is ever
-- edited in place, so full history survives at every position.
--
-- Every planting is in exactly one of two clean states:
--   - organized: plot_id + plot_row_id + position are all set together
--     (deliberately placed in a gridded plot/row/slot)
--   - unplotted: none of those three are set, and location is required
--     instead (a wild tree, weed, or invasive found somewhere in the
--     parcel, with no row/slot to describe it)
-- A location can still optionally be recorded on an organized planting
-- too (e.g. for later comparison against aerial imagery extents) -- it's
-- just not required there.

create table public.planting (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  parcel_id uuid not null references public.parcels (id),
  plot_id uuid references public.plots (id),
  plot_row_id uuid references public.plot_rows (id),
  position integer,
  location extensions.geography(point, 4326),
  species text,
  category text,
  planted_date date,
  removed_date date,
  created_at timestamptz not null default now(),
  check (
    (plot_id is not null and plot_row_id is not null and position is not null)
    or
    (plot_id is null and plot_row_id is null and position is null and location is not null)
  )
);

comment on table public.planting is 'One plant''s occupancy of a place (organized plot/row/position, or an unplotted location), from planted_date to nullable removed_date. Replacing a plant closes the old row and inserts a new one -- history is never overwritten.';
comment on column public.planting.category is 'Free-text categorization (e.g. crop, weed, invasive, volunteer) -- not a constrained enum, so new categories don''t require a migration.';

create index planting_producer_id_idx on public.planting (producer_id);
create index planting_parcel_id_idx on public.planting (parcel_id);
create index planting_plot_id_idx on public.planting (plot_id);
create index planting_plot_row_id_idx on public.planting (plot_row_id);
create index planting_location_gix on public.planting using gist (location);

-- At most one *active* planting per position -- also enforces the
-- close-old-before-opening-new workflow at the database level.
create unique index planting_active_position_idx
  on public.planting (plot_row_id, position)
  where removed_date is null;

alter table public.planting enable row level security;

create policy "planting: member can view producer's plantings"
  on public.planting for select
  using (private.user_can_access_producer(producer_id));
