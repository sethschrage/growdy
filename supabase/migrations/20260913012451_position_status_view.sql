-- position_status derives, for every organized (plot/row/position) spot
-- that has ever had a planting, whether it's currently planted, blocked
-- (dead but not yet cleared), or open (cleared, available again). See
-- docs/decisions/0006 for the full reasoning.
--
-- Only the LATEST planting at each position determines its status --
-- older, superseded plantings at the same spot don't matter here.
-- "Latest" means highest planted_date, tie-broken by created_at.
--
-- Unplotted plantings (plot_row_id is null, per the organized/unplotted
-- design in docs/decisions/0002) are excluded: they have no numbered
-- position, so "position status" doesn't apply to them at all.
--
-- A position with zero planting records ever simply doesn't appear here
-- -- there's no stored "this row has N positions" fact to check against,
-- so "never planted" is represented by absence, not a status value.
--
-- This is a plain view (not security definer), so it's subject to the
-- same RLS as the underlying planting table for whoever queries it --
-- no separate access control needed.

create or replace view public.position_status as
with latest as (
  select distinct on (plot_row_id, position)
    id, plot_row_id, position, producer_id, dead_date, removed_date
  from public.planting
  where plot_row_id is not null
  order by plot_row_id, position, planted_date desc nulls last, created_at desc
)
select
  plot_row_id,
  position,
  producer_id,
  id as planting_id,
  case
    when removed_date is not null then 'open'
    when dead_date is not null then 'blocked'
    else 'planted'
  end as status
from latest;

comment on view public.position_status is 'Derived planted/blocked/open status per (plot_row, position), from each position''s latest planting. Positions never planted at all are absent, not a status value. See docs/decisions/0006.';
