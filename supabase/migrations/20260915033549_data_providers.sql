-- First piece of external data channels (docs/decisions/0019): a global,
-- admin-curated registry of who Growdy knows how to pull data from.
-- Producers never create a provider -- integrating a new one means writing
-- real ingestion code, so this table only ever changes via direct reviewed
-- SQL, the same precedent already used for plant_types promotion and
-- producer onboarding.
create table public.data_providers (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  enabled boolean not null default true,
  context text,
  created_at timestamptz not null default now()
);

comment on table public.data_providers is 'Admin-curated registry of external data providers (e.g. "Tempest" under category "weather"). Global, not producer-scoped -- a producer picks from this list when adding their own data_sources row; they never create a provider themselves.';
comment on column public.data_providers.category is 'The kind of data this provider supplies (e.g. "weather"). Open vocabulary like planting.category, not check-constrained -- new categories are added by us, not by producers, so a closed enum would buy nothing a review process doesn''t already give.';
comment on column public.data_providers.enabled is 'Whether producers can currently add a source against this provider. Does not gate visibility (see RLS) -- a disabled provider must stay readable so it can be re-enabled and so any existing sources against it still resolve their provider name.';
comment on column public.data_providers.context is 'Free-text context surfaced to the chat alongside the schema description (e.g. caveats about this provider''s data). Nullable -- most providers won''t need it.';

alter table public.data_providers enable row level security;

-- using (true), not using (enabled): filtering out disabled providers is a
-- job for whatever builds the provider dropdown or the chat's context, not
-- RLS -- a disabled row must stay visible to whatever needs to see or
-- re-enable it.
create policy "data_providers: any signed-in user can view"
  on public.data_providers for select
  using (true);

-- No insert/update/delete policy: changes are admin-only, via direct SQL,
-- same as plant_types promotion and producer onboarding today.

-- This project has been bitten before by correct RLS with no base grant
-- (20260913054119_authenticated_table_grants.sql) -- every request failed
-- until that was caught. Not repeating it: the grant ships in the same
-- migration as the table, every time, from here on.
grant select on public.data_providers to authenticated;

-- Seed the first real provider now, in the same migration that creates the
-- table -- mirrors app_status's self-seeding pattern.
insert into public.data_providers (category, name, enabled)
values ('weather', 'Tempest', true);
