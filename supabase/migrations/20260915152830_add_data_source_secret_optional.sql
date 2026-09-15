-- A device's built-in geolocation has no credential to store -- there's
-- nothing to put in Vault, and nothing to backfill (backfill_status is
-- already documented as meaningful-when-null for "a source kind with no
-- historical backfill concept"). add_data_source required p_secret
-- unconditionally, forcing every source through the same
-- credentialed-external-API shape Tempest needs.
--
-- Same signature (p_secret's type/position is unchanged, only its default
-- is added), so this is a true replace, not a new overload -- the
-- existing grant to authenticated still applies to the same function OID.
create or replace function public.add_data_source(
  p_provider_id uuid,
  p_name text,
  p_external_id text,
  p_secret text default null,
  p_config jsonb default null,
  p_backfill_start timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  caller_producer_id uuid;
  new_vault_secret_id uuid;
  new_source_id uuid;
begin
  select producer_id into caller_producer_id
  from public.profiles
  where id = auth.uid();

  if caller_producer_id is null then
    raise exception 'no producer found for the current user';
  end if;

  if p_secret is not null then
    new_vault_secret_id := vault.create_secret(
      p_secret,
      format('data_source:%s:%s', p_provider_id, p_external_id)
    );
  end if;

  insert into public.data_sources (
    provider_id, producer_id, name, external_id, vault_secret_id, config,
    backfill_status, backfill_start
  ) values (
    p_provider_id, caller_producer_id, p_name, p_external_id, new_vault_secret_id, p_config,
    case when p_secret is not null then 'pending' else null end,
    case when p_secret is not null then coalesce(p_backfill_start, '2019-01-01'::timestamptz) else null end
  )
  returning id into new_source_id;

  return new_source_id;
end;
$$;

comment on function public.add_data_source is 'Creates a data_sources row for the calling user''s own producer, and (only when p_secret is given) a Vault secret referencing it, in one atomic call. p_secret is optional -- a source with no external credential (e.g. a device''s own geolocation) gets no Vault entry and no backfill_status/backfill_start, since neither concept applies to it. The only way a data_sources row is ever created -- there is no direct insert policy on the table (see 20260915033647_data_sources.sql).';
