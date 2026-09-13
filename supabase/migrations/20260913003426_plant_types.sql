-- plant_types is a shared, global reference table of known plant/cultivar/
-- variety/scion/rootstock names (e.g. "ENTAV-INRA(R) 358", "3309 Couderc")
-- -- NOT producer-scoped, since the same cultivar is the same cultivar no
-- matter which producer uses it.
--
-- `kind` distinguishes which role a name plays: a variety (for an
-- own-rooted plant's single identity), a scion (the fruiting/above-ground
-- graft component), or a rootstock (the root graft component). These are
-- meaningfully different things -- a rootstock cultivar is never usable as
-- a scion -- so kind is check-constrained, unlike open-ended vocabularies
-- elsewhere in this schema (e.g. planting.category): kind is a small,
-- closed, structurally-relevant classification, not a growing descriptive
-- tag.
--
-- Any producer can implicitly "propose" a new plant type just by entering
-- a name that doesn't already exist -- there's no separate proposal table
-- or workflow. A new row starts life as status = 'pending': usable
-- immediately by the producer who proposed it (so they're never blocked
-- from saving their own data), but invisible to every other producer until
-- a maintainer reviews it and flips it to 'canonical' with a plain UPDATE,
-- reviewed like any other change through this project's existing PR-based
-- process -- no automated/self-service promotion exists yet (future work,
-- once a UI exists). A rejected proposal (status = 'rejected') stays
-- visible to the producer who proposed it, so they can see it was
-- declined, but never becomes globally visible.
--
-- No uniqueness constraint on name (yet). Case sensitivity, whitespace/
-- accent normalization, and whether a rejected name should block a future
-- re-proposal of the same text are all open product questions without an
-- obviously correct answer today. Left as a trusted, human-reviewed
-- invariant for now -- a maintainer can catch accidental duplicates during
-- the manual acceptance review -- the same kind of accepted looseness as
-- producer_id elsewhere in this schema; revisit if it becomes a real
-- problem.

create table public.plant_types (
  id uuid primary key default gen_random_uuid(),
  proposed_by_producer_id uuid references public.producers (id),
  name text not null,
  kind text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  check (kind in ('variety', 'scion', 'rootstock')),
  check (status in ('pending', 'canonical', 'rejected')),
  check (status = 'canonical' or proposed_by_producer_id is not null)
);

comment on table public.plant_types is 'Shared, global reference list of known variety/scion/rootstock names -- not producer-scoped. A row moves from pending to canonical (globally visible) or rejected (visible only to its proposer) via manual maintainer review.';
comment on column public.plant_types.kind is 'Which role this name plays: variety (own-rooted plant identity), scion, or rootstock. Check-constrained since these are structurally distinct, unlike open-ended vocabularies elsewhere in this schema.';
comment on column public.plant_types.status is 'Workflow state: pending (awaiting review, visible only to the producer who proposed it), canonical (reviewed and accepted, visible to every producer), or rejected (declined, still visible only to the proposer).';
comment on column public.plant_types.proposed_by_producer_id is 'Producer who proposed this value. Null only for pre-seeded canonical rows that were never proposed by anyone; required for any pending or rejected row (see check constraint).';

create index plant_types_proposed_by_producer_id_idx on public.plant_types (proposed_by_producer_id);
create index plant_types_kind_idx on public.plant_types (kind);
create index plant_types_status_idx on public.plant_types (status);
create index plant_types_name_idx on public.plant_types (name);

alter table public.plant_types enable row level security;

create policy "plant_types: canonical visible to all, pending/rejected visible only to proposer"
  on public.plant_types for select
  to authenticated
  using (
    status = 'canonical'
    or private.user_can_access_producer(proposed_by_producer_id)
  );

-- FUTURE, not part of this change: once a front-end exists, self-service
-- proposing could look like:
--
-- create policy "plant_types: producer can propose a new pending entry"
--   on public.plant_types for insert
--   to authenticated
--   with check (
--     status = 'pending'
--     and private.user_can_access_producer(proposed_by_producer_id)
--   );
--
-- Acceptance/rejection (update to canonical/rejected) is explicitly staying
-- maintainer-only/manual for the foreseeable future -- no self-service
-- promotion policy is anticipated soon.
