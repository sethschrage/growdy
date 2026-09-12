-- A plot is a named subdivision within a parcel (e.g. "N", "South Block"),
-- used to organize plantings into rows. A plot always belongs to exactly
-- one parcel.
--
-- producer_id is a plain FK to producers, not enforced to match the parent
-- parcel's producer_id (that would need a composite FK / unique constraint
-- on parcels(id, producer_id)). Left as a trusted app-level invariant for
-- now, since the schema is still moving fast -- revisit only if it becomes
-- a real problem.

create table public.plots (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcels (id),
  producer_id uuid not null references public.producers (id),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.plots is 'A named subdivision within a parcel (e.g. "N", "South Block"), organizing plantings into rows.';

create index plots_producer_id_idx on public.plots (producer_id);
create index plots_parcel_id_idx on public.plots (parcel_id);

alter table public.plots enable row level security;

create policy "plots: member can view producer's plots"
  on public.plots for select
  using (private.user_can_access_producer(producer_id));
