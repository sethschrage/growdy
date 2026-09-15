-- Second piece of external data channels (docs/decisions/0019): the only
-- user-addable/removable entity in this design. A producer picks an
-- enabled data_providers row and supplies their own credentials -- they
-- never invent a new provider or point ingestion at a URL of their choosing
-- (the provider's own integration code owns the real, fixed endpoint).
create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.data_providers (id),
  producer_id uuid not null references public.producers (id),
  name text not null,
  external_id text not null,
  vault_secret_id uuid,
  enabled boolean not null default true,
  context text,
  config jsonb,
  backfill_status text check (backfill_status in ('pending', 'in_progress', 'complete')),
  backfill_cursor timestamptz,
  backfill_start timestamptz,
  last_synced_at timestamptz,
  last_error text,
  last_warning text,
  created_at timestamptz not null default now()
);

comment on table public.data_sources is 'A producer''s own configured instance of a provider (e.g. their specific Tempest station). The only layer of docs/decisions/0019''s Category/Provider/Source taxonomy a producer adds or removes themselves.';
comment on column public.data_sources.name is 'The producer''s own label for this source (e.g. "Home Station") -- free text, not shared/deduplicated, same category as planting.nickname.';
comment on column public.data_sources.external_id is 'The identifier this source is known by at the provider (e.g. Tempest''s station ID). Its own column, not buried in config, since it''s always present and structurally meaningful.';
comment on column public.data_sources.vault_secret_id is 'References a row in Supabase Vault (vault.secrets/vault.decrypted_secrets) holding this source''s credential (e.g. a Tempest API token). Never a plain-text column. Set atomically with the row via private.add_data_source -- never populated any other way, so it should never actually be null in practice despite being nullable at the type level.';
comment on column public.data_sources.config is 'Provider-specific settings that aren''t worth their own column yet (evidence-before-abstraction, same as planting.category staying free text). Nullable.';
comment on column public.data_sources.backfill_status is 'One of pending/in_progress/complete, or null. Null is meaningful, not an oversight: a source kind with no historical backfill concept (a future non-time-series provider) simply never sets this, rather than every row-kind being forced to assert a value that isn''t true of it.';
comment on column public.data_sources.backfill_start is 'The fixed floor date backfill walks down to before being considered complete. Set when the source is added; deliberately not inferred from an empty API response, since an empty response''s real meaning (reached the station''s actual start date, vs. a transient provider hiccup) isn''t something to guess at.';
comment on column public.data_sources.last_synced_at is 'When ingestion last completed successfully. Shown in the UI so staleness (no unattended background sync exists -- see 0019) is honest and visible rather than silent.';
comment on column public.data_sources.last_error is 'The most recent ingestion failure that blocked something from being stored (a bad API call, a field failing its plausibility range). Cleared on the next successful run.';
comment on column public.data_sources.last_warning is 'Distinct from last_error: set when ingestion succeeded but noticed something worth a human''s attention, e.g. a field in the provider''s response with no matching column yet. Never blocks storage of the fields that did validate.';

create index data_sources_producer_id_idx on public.data_sources (producer_id);
create index data_sources_provider_id_idx on public.data_sources (provider_id);

alter table public.data_sources enable row level security;

create policy "data_sources: member can view producer's sources"
  on public.data_sources for select
  using (private.user_can_access_producer(producer_id));

create policy "data_sources: member can update producer's sources"
  on public.data_sources for update
  using (private.user_can_access_producer(producer_id))
  with check (private.user_can_access_producer(producer_id));

create policy "data_sources: member can delete producer's sources"
  on public.data_sources for delete
  using (private.user_can_access_producer(producer_id));

-- No insert policy: rows are created only via private.add_data_source
-- (next migration), which creates the Vault secret and the row together --
-- inserting directly would either skip the credential or require passing
-- a raw secret through a column this table never has.

grant select, update, delete on public.data_sources to authenticated;
