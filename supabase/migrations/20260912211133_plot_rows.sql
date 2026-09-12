-- A plot_row is a numbered row within a plot (the "11" in "N-11-4"). Named
-- plot_rows rather than "rows" to avoid colliding with SQL's ROW()
-- constructor and the ROWS keyword used in window-function syntax, which
-- would otherwise force quoting ("rows") in every query.
--
-- Display label format is plot-row-position, hyphen-delimited throughout
-- ("N-11-4"), not the plot+row concatenated without a separator ("N11-4")
-- floated earlier. Since plot names are free text, concatenating plot
-- directly against row without a delimiter is ambiguous or unparseable
-- once a plot name isn't exactly one character (e.g. "NW", "South Block",
-- or a plot literally named "11"). This label is never stored -- it's
-- computed from plots.name + plot_rows.number (+ planting.position) at
-- read time.
--
-- A row always belongs to a plot -- an unplotted planting attaches
-- directly to a parcel instead, with no row.
--
-- Row-level attributes (irrigation zone, trellis type, orientation, ...)
-- are deliberately not added yet -- nothing needs them today, and having
-- row as its own table means they can be added later without touching
-- the planting table at all.

create table public.plot_rows (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references public.plots (id),
  producer_id uuid not null references public.producers (id),
  number integer not null,
  created_at timestamptz not null default now(),
  unique (plot_id, number)
);

comment on table public.plot_rows is 'A numbered row within a plot (the "11" in "N-11-4").';

create index plot_rows_producer_id_idx on public.plot_rows (producer_id);
create index plot_rows_plot_id_idx on public.plot_rows (plot_id);

alter table public.plot_rows enable row level security;

create policy "plot_rows: member can view producer's rows"
  on public.plot_rows for select
  using (private.user_can_access_producer(producer_id));
