-- Physical measurements of a row: its length and the fixed spacing
-- between adjacent positions within it. These are properties of the row
-- itself (the physical infrastructure), never of an individual planting
-- -- exactly the reason plot_row was made its own table from the start,
-- so attributes like this could be added later without touching
-- planting at all.
--
-- Both nullable: not every row will have this recorded immediately, and
-- forcing a value would mean guessing one.
--
-- Units are meters, fixed in the column name rather than a separate
-- unit column -- there's no current need for mixed units across rows;
-- if that changes, it's a later migration, not a speculative unit-system
-- built ahead of any real case needing it.
--
-- spacing_meters is a single fixed value per row (confirmed: not varying
-- position-to-position within a row, and not shared across a whole plot
-- -- each row has its own).

alter table public.plot_rows
  add column length_meters numeric,
  add column spacing_meters numeric;

comment on column public.plot_rows.length_meters is 'Physical length of the row, in meters.';
comment on column public.plot_rows.spacing_meters is 'Fixed distance between adjacent positions within this row, in meters.';
