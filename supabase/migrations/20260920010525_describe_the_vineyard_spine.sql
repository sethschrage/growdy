-- Comments only: no table, column or policy changes.
--
-- The chat builds its description of the database from these comments
-- at request time, and four of the tables it leans on hardest -- the
-- parcel/plot/row spine and the producer at the top of it -- had no
-- column comments at all. The model was handed `plot_rows.number
-- (integer) [required]` and left to guess whether that was a count, an
-- ordinal, or an identifier.
--
-- These are also the tables the GIS work will attach geometry to, so
-- the meanings are worth pinning down before anything else hangs off
-- them.

comment on column public.producers.id is
  'Primary key. The tenancy root -- every vineyard row in this schema carries a producer_id that resolves here.';
comment on column public.producers.name is
  'The producer''s own name for their operation, as they entered it. Display text, not an identifier.';
comment on column public.producers.created_at is
  'When this producer was first created in growdy. Not the founding date of the vineyard.';

comment on column public.parcels.id is
  'Primary key. Parcels are the outermost physical division: a contiguous piece of land the producer treats as one place.';
comment on column public.parcels.producer_id is
  'Owning producer. RLS checks this against the caller''s profile, so a query that omits it returns nothing rather than everything.';
comment on column public.parcels.name is
  'The producer''s own name for the parcel, e.g. "Home Block". Display text; not unique and not stable enough to join on.';
comment on column public.parcels.created_at is
  'When this parcel was recorded in growdy. Says nothing about when the land was planted.';

comment on column public.plots.id is
  'Primary key. A plot is a subdivision of a parcel -- typically one variety, or one management unit.';
comment on column public.plots.parcel_id is
  'The parcel this plot sits inside. Every plot belongs to exactly one parcel.';
comment on column public.plots.producer_id is
  'Owning producer, denormalised from the parcel so RLS can check one column without a join.';
comment on column public.plots.name is
  'The producer''s own name for the plot. Display text, unique only within its parcel by convention, not by constraint.';
comment on column public.plots.created_at is
  'When this plot was recorded in growdy.';

comment on column public.plot_rows.id is
  'Primary key. A row is one trellised line of vines within a plot -- the unit a producer walks down.';
comment on column public.plot_rows.plot_id is
  'The plot this row belongs to.';
comment on column public.plot_rows.producer_id is
  'Owning producer, denormalised from the plot so RLS can check one column without a join.';
comment on column public.plot_rows.number is
  'The row''s number as painted on the end post: an ordinal within its plot, not a count and not unique across plots. Producers say "row 12" and mean this.';
comment on column public.plot_rows.created_at is
  'When this row was recorded in growdy.';
