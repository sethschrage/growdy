-- planting_readable resolves every FK on planting into its actual name,
-- for browsing in Table Editor or ad-hoc querying without manually
-- joining plots/plot_rows/plant_types every time.
--
-- Also computes the human-readable label (plot-row-position, e.g.
-- "North-11-4") at read time, exactly as planned in the plot_rows
-- migration comment ("this label is never stored -- it's computed... at
-- read time") -- null for unplotted plantings, which have no numbered
-- position to label.
--
-- location is exposed as separate latitude/longitude numeric columns
-- (via ST_Y/ST_X) rather than raw geography WKB, for readability.
--
-- A plain view, not security definer -- subject to the same RLS as the
-- underlying planting table for whoever queries it.

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
  sc.name as scion,
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

comment on view public.planting_readable is 'planting with every FK resolved to its actual name, and a computed plot-row-position label, for browsing without manual joins.';
