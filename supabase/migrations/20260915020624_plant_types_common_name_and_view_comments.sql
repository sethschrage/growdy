-- A plant_types row's name is often a formal certified clone identifier
-- (e.g. "ENTAV-INRA(R) 358"), not the grape variety a producer or the chat
-- would actually search for (e.g. "Gamay"). common_name closes that gap --
-- distinct from planting.nickname, which is a per-planting, non-shared,
-- informal label (see docs/decisions/0018).
alter table public.plant_types
  add column common_name text;

comment on column public.plant_types.common_name is
  'The common grape variety name this row is actually known as (e.g. "Gamay" for scion clone "ENTAV-INRA(R) 358"). Distinct from name, which may be a formal certified clone identifier, and from planting.nickname, which is a per-planting informal label, not a shared reference. Nullable -- populated where known, mainly for scion rows whose name is a clone code rather than a variety name.';

-- Not backfilled automatically here, on purpose: a common name can
-- plausibly apply to more than one clone or rootstock entry (this
-- producer's real data already has two different Cabernet Franc clones),
-- so setting it is a real judgment call, not a one-to-one lookup a
-- migration should make unattended. Left for a human to enter by hand,
-- the same reviewed way any other plant_types promotion works -- see
-- docs/decisions/0018 for the ENTAV-INRA registry values researched
-- for this producer's actual four scion rows, ready to enter, not
-- applied here.

-- planting_readable.scion now prefers the common name over the formal
-- clone identifier when one is known, so a question like "how much Gamay"
-- can match this column directly instead of needing planting.nickname's
-- free text to happen to say the same thing. variety and rootstock are
-- unchanged -- kind = 'variety' rows are already typically named for the
-- common variety, and rootstocks are conventionally referred to by their
-- formal identifier (e.g. "3309").
create or replace view public.planting_readable as
select
  p.id,
  p.producer_id,
  pc.name as parcel,
  pl.name as plot,
  pr.number as row_number,
  p.position,
  case
    when pr.number is not null and p.position is not null
      then pl.name || '-' || pr.number || '-' || p.position
    else null
  end as label,
  p.nickname,
  v.name as variety,
  coalesce(sc.common_name, sc.name) as scion,
  rs.name as rootstock,
  p.category,
  st_y(p.location::geometry) as latitude,
  st_x(p.location::geometry) as longitude,
  p.planted_date,
  p.dead_date,
  p.removed_date,
  p.removed_reason,
  p.created_at
from public.planting p
join public.parcels pc on p.parcel_id = pc.id
left join public.plot_rows pr on p.plot_row_id = pr.id
left join public.plots pl on p.plot_id = pl.id
left join public.plant_types v on p.variety_id = v.id
left join public.plant_types sc on p.scion_variety_id = sc.id
left join public.plant_types rs on p.rootstock_variety_id = rs.id;

-- create or replace view doesn't reliably carry storage parameters
-- forward across a redefinition -- re-assert the RLS-scoping fix from
-- 20260913070957 explicitly rather than assume it survived.
alter view public.planting_readable set (security_invoker = true);

-- planting_readable and position_status had no column comments of their
-- own at all -- the chat was told to prefer them, but had nothing
-- documenting what their columns mean or, for position_status.status,
-- what values are even possible. Both are computed views (see their
-- definitions), so these comments carry meaning the underlying tables'
-- own comments don't fully capture on their own.
comment on view public.planting_readable is
  'planting with every FK resolved to its actual name, and a computed plot-row-position label, for browsing without manual joins -- prefer this over the raw planting table for most questions.';

comment on column public.planting_readable.label is
  'Human-readable position label ("N-11-4" = plot N, row 11, position 4). Null for an unplotted planting (see latitude/longitude instead) or an organized one missing a row or position.';

comment on column public.planting_readable.variety is
  'Variety name for an own-rooted plant. Null if this planting is grafted -- see scion/rootstock instead. Exactly one of variety, or the scion+rootstock pair, is populated per planting.';

comment on column public.planting_readable.scion is
  'Scion (fruiting) variety for a grafted plant -- the common variety name (e.g. "Gamay") when known, otherwise the formal certified clone identifier. Null for an own-rooted or wild plant -- see variety instead.';

comment on column public.planting_readable.rootstock is
  'Rootstock for a grafted plant, by its formal identifier (e.g. "3309 Couderc"). Null for an own-rooted or wild plant.';

comment on column public.planting_readable.nickname is
  'Producer''s own informal label for this specific planting (e.g. "Gamay114") -- free text, per-planting, not a shared reference like variety/scion/rootstock.';

comment on column public.planting_readable.category is
  'Free-text categorization (e.g. crop, weed, invasive, volunteer) -- open vocabulary, not a fixed list.';

comment on column public.planting_readable.latitude is
  'Populated only for an unplotted planting (a PostGIS point instead of a plot/row/position). Null for an organized planting -- see plot/row_number/position/label instead.';

comment on column public.planting_readable.longitude is
  'Populated only for an unplotted planting. Null for an organized planting.';

comment on column public.planting_readable.dead_date is
  'When the plant was observed/determined dead -- can precede removed_date; a dead plant not yet cleared still occupies its position.';

comment on column public.planting_readable.removed_date is
  'When the plant was removed/cleared from its position, freeing it for replanting. Null if still occupying its position, whether alive or dead-but-uncleared.';

comment on column public.planting_readable.removed_reason is
  'Free-text reason removed_date was set (e.g. dead, damaged, replaced) -- open vocabulary.';

comment on view public.position_status is
  'Derived planted/blocked/open status per (plot_row, position), from each position''s latest planting. Positions never planted at all are absent, not a status value. See docs/decisions/0006.';

comment on column public.position_status.status is
  'One of exactly three values: "planted" (a living plant currently occupies this position), "blocked" (the most recent plant here died but has not been removed/cleared yet -- occupied but not productive), "open" (the most recent plant was removed -- empty and available for replanting). There is no "dead" or "alive" value; a plain "dead" filter will match nothing.';

comment on column public.position_status.planting_id is
  'The most recent planting at this position -- join to planting or planting_readable for its details.';
