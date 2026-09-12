-- Tenancy foundation: producers (the permission boundary) and profiles
-- (one row per auth.users, one producer per user for now).
--
-- Deliberately simple: a user belongs to exactly one producer via
-- profiles.producer_id. Every RLS policy on tables below this point checks
-- access through a single function, user_can_access_producer(), so the
-- membership model (simple column vs. a multi-producer join table) can
-- change later without touching any policy on any other table. See
-- docs/decisions/0001-tenancy-membership-model.md.

create table public.producers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.producers is 'Tenant / permission boundary. A producer may own multiple parcels.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  producer_id uuid not null references public.producers (id),
  full_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth.users. producer_id is the single producer this user belongs to.';

create index profiles_producer_id_idx on public.profiles (producer_id);

-- Lives in a private, non-API-exposed schema so it's only reachable from
-- inside RLS policy evaluation, not as a directly callable RPC endpoint.
create schema if not exists private;

create or replace function private.user_can_access_producer(target_producer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.producer_id = target_producer_id
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.user_can_access_producer(uuid) to authenticated;

alter table public.producers enable row level security;
alter table public.profiles enable row level security;

create policy "producers: member can view their producer"
  on public.producers for select
  using (private.user_can_access_producer(id));

create policy "profiles: user can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: user can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- No insert/update/delete policies on producers, and no insert/delete on
-- profiles, yet: with no front-end, onboarding (creating a producer and
-- attaching the first user to it) happens via service_role for now.
