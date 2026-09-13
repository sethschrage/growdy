-- A planting's lifecycle has three distinct moments, not two:
--   planted_date -> (optional) dead_date -> (optional) removed_date
--
-- dead_date and removed_date are NOT the same event. A plant can die while
-- still physically in the ground -- removed_date is specifically when it
-- was actually cleared out, which is what determines whether a new
-- planting can occupy the same position (see planting_active_position_idx,
-- keyed on removed_date is null). dead_date is an approximate/observed
-- date (we usually don't know the exact moment of death), so it's named
-- for what it records, not a precise biological timestamp.
--
-- removed_reason is free text (like category, not check-constrained like
-- plant_types.kind or status) -- removal causes are an open, growing
-- vocabulary (dead, damaged, replaced, ...), not a small closed set an
-- RLS policy or other logic branches on.

alter table public.planting
  add column dead_date date,
  add column removed_reason text;

comment on column public.planting.dead_date is 'When the plant was observed/determined dead -- approximate, not a precise moment. Can precede removed_date; a dead plant not yet cleared still occupies its position.';
comment on column public.planting.removed_reason is 'Free-text reason removed_date was set (e.g. dead, damaged, replaced) -- open vocabulary, not constrained.';
