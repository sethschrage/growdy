-- docs/decisions/0025: a parcel's owner can share just that parcel with
-- another producer (editor or viewer), without exposing either side's
-- other parcels or accounts. Extends 0001's isolated membership-check
-- discipline -- new helper functions, not an inlined join in every
-- policy -- rather than reaching for 0001's own planned full-account
-- join table, since the actual need here is narrower than that.

create table public.parcel_shares (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcels (id) on delete cascade,
  shared_with_producer_id uuid not null references public.producers (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (parcel_id, shared_with_producer_id)
);

comment on table public.parcel_shares is 'A grant of access to one specific parcel, from its owner to another producer -- editor (can write) or viewer (read-only). Never a whole-account grant; see docs/decisions/0025. There is no ''owner'' role here -- the real owner is parcels.producer_id, unchanged.';

create index parcel_shares_shared_with_producer_id_idx on public.parcel_shares (shared_with_producer_id);

alter table public.parcel_shares enable row level security;

-- The owner sees every share on their own parcels (to manage them); a
-- share recipient sees only their own row, never who else has access to
-- the same parcel -- closing a real information-leak this design would
-- otherwise have (see 0025's own follow-up note on this).
create policy "parcel_shares: owner can view shares on their own parcels"
  on public.parcel_shares for select
  using (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_shares.parcel_id
        and private.user_can_access_producer(p.producer_id)
    )
  );

create policy "parcel_shares: recipient can view their own share"
  on public.parcel_shares for select
  using (private.user_can_access_producer(shared_with_producer_id));

-- The one place a mistake here would matter most: this has to check that
-- the caller owns the parcel being shared, not merely that they're some
-- valid producer -- otherwise any producer could hand out access to land
-- that isn't theirs.
create policy "parcel_shares: owner can create shares on their own parcels"
  on public.parcel_shares for insert
  with check (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_id
        and private.user_can_access_producer(p.producer_id)
    )
  );

create policy "parcel_shares: owner can revoke shares on their own parcels"
  on public.parcel_shares for delete
  using (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_shares.parcel_id
        and private.user_can_access_producer(p.producer_id)
    )
  );

create policy "parcel_shares: owner can change a share's role"
  on public.parcel_shares for update
  using (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_shares.parcel_id
        and private.user_can_access_producer(p.producer_id)
    )
  )
  with check (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_shares.parcel_id
        and private.user_can_access_producer(p.producer_id)
    )
  );

-- Deliberately column-scoped from the start, not table-wide-then-narrowed:
-- role is the only thing an existing share should ever change. Retargeting
-- parcel_id or shared_with_producer_id is delete-and-recreate, not update
-- -- the exact shape of the profiles.producer_id gap this project just
-- found and fixed, closed here before it could ever exist.
grant select, insert, delete on public.parcel_shares to authenticated;
grant update (role) on public.parcel_shares to authenticated;

-- Cascading access, isolated behind functions the same way 0001 isolated
-- producer membership -- callers never inline this join themselves.
create or replace function private.user_can_access_parcel(target_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.parcels p
    where p.id = target_parcel_id
      and (
        private.user_can_access_producer(p.producer_id)
        or exists (
          select 1 from public.parcel_shares ps
          where ps.parcel_id = p.id
            and private.user_can_access_producer(ps.shared_with_producer_id)
        )
      )
  );
$$;

comment on function private.user_can_access_parcel is 'True if the caller''s producer owns this parcel or holds any share (editor or viewer) on it. See docs/decisions/0025.';

create or replace function private.user_can_edit_parcel(target_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.parcels p
    where p.id = target_parcel_id
      and (
        private.user_can_access_producer(p.producer_id)
        or exists (
          select 1 from public.parcel_shares ps
          where ps.parcel_id = p.id
            and ps.role = 'editor'
            and private.user_can_access_producer(ps.shared_with_producer_id)
        )
      )
  );
$$;

comment on function private.user_can_edit_parcel is 'True only for the parcel''s owner or an editor share -- a viewer share fails this one. Not wired into any write policy yet; ready for when a table is actually onboarded into the write tool (0022). See docs/decisions/0025.';

-- plot_rows only reaches a parcel through plot_id -> plots.parcel_id, not
-- directly -- this is what makes that indirection a one-line call instead
-- of a repeated join.
create or replace function private.user_can_access_plot(target_plot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.plots pl
    where pl.id = target_plot_id
      and private.user_can_access_parcel(pl.parcel_id)
  );
$$;

comment on function private.user_can_access_plot is 'Resolves a plot to its parcel, then defers to user_can_access_parcel -- plot_rows has no direct parcel_id of its own. See docs/decisions/0025.';

grant execute on function private.user_can_access_parcel(uuid) to authenticated;
grant execute on function private.user_can_edit_parcel(uuid) to authenticated;
grant execute on function private.user_can_access_plot(uuid) to authenticated;

-- plots and planting have a direct parcel_id, so their existing SELECT
-- policy becomes a strict superset of itself: still true for the owner
-- (user_can_access_parcel checks producer ownership internally), now also
-- true for a valid share. Nothing narrows.
alter policy "plots: member can view producer's plots"
  on public.plots
  using (private.user_can_access_parcel(parcel_id));

alter policy "planting: member can view producer's plantings"
  on public.planting
  using (private.user_can_access_parcel(parcel_id));

alter policy "plot_rows: member can view producer's rows"
  on public.plot_rows
  using (private.user_can_access_plot(plot_id));

-- observations.planting_id is nullable (0014) -- a general note isn't
-- always about a specific plant, and therefore isn't always under any
-- parcel at all. Chosen depth: a share reaches an observation only when
-- it's actually tied to a planting under that parcel; a general
-- observation with no planting_id stays visible only to the owning
-- producer, since it was never really about that parcel to begin with.
alter policy "observations: member can view producer's observations"
  on public.observations
  using (
    private.user_can_access_producer(producer_id)
    or (
      planting_id is not null
      and exists (
        select 1 from public.planting pl
        where pl.id = observations.planting_id
          and private.user_can_access_parcel(pl.parcel_id)
      )
    )
  );

-- Self-serve parcel creation -- didn't exist at all before this. No new
-- RPC needed: no credential, no side effect, just a producer creating
-- their own row.
create policy "parcels: member can create their own parcels"
  on public.parcels for insert
  with check (private.user_can_access_producer(producer_id));

grant insert on public.parcels to authenticated;
