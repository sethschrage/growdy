-- Fourth piece of external data channels (docs/decisions/0019): credential
-- handling. A producer's own third-party API key (e.g. a Tempest personal
-- access token) is a real secret we don't own, stored in Supabase Vault
-- (encrypted at rest), never a plain column. Vault's own tables/views are
-- not directly reachable by `authenticated` -- these two functions are the
-- only door in, each scoped to exactly the caller's own data, the same
-- SECURITY DEFINER pattern private.user_can_access_producer() already
-- uses. No service_role is ever needed for this: an Edge Function acting
-- on the caller's own forwarded JWT calls these functions the same way it
-- calls anything else.

-- Creates the Vault secret and the data_sources row together, atomically --
-- deliberately not a two-step "create secret, then attach id" flow, which
-- could leave an orphaned secret or a source with no key if the second
-- step failed. Parameters are prefixed (p_...) to avoid shadowing the
-- columns of the same name inside the function body -- a real PL/pgSQL
-- footgun otherwise.
create or replace function private.add_data_source(
  p_provider_id uuid,
  p_name text,
  p_external_id text,
  p_secret text,
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

  new_vault_secret_id := vault.create_secret(
    p_secret,
    format('data_source:%s:%s', p_provider_id, p_external_id)
  );

  insert into public.data_sources (
    provider_id, producer_id, name, external_id, vault_secret_id, config,
    backfill_status, backfill_start
  ) values (
    p_provider_id, caller_producer_id, p_name, p_external_id, new_vault_secret_id, p_config,
    'pending', coalesce(p_backfill_start, now() - interval '5 years')
  )
  returning id into new_source_id;

  return new_source_id;
end;
$$;

comment on function private.add_data_source is 'Creates a Vault secret for p_secret and a data_sources row referencing it, in one atomic call, for the calling user''s own producer. The only way a data_sources row is ever created -- there is no direct insert policy on the table (see 20260915033647_data_sources.sql).';

grant execute on function private.add_data_source(uuid, text, text, text, jsonb, timestamptz) to authenticated;

-- Returns a source's decrypted credential, but only if the caller actually
-- owns it -- never a blanket read of vault.decrypted_secrets.
create or replace function private.get_decrypted_source_secret(p_source_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  source_producer_id uuid;
  source_vault_secret_id uuid;
  result text;
begin
  select producer_id, vault_secret_id into source_producer_id, source_vault_secret_id
  from public.data_sources
  where id = p_source_id;

  if source_producer_id is null or not private.user_can_access_producer(source_producer_id) then
    raise exception 'not authorized to access this data source';
  end if;

  select decrypted_secret into result
  from vault.decrypted_secrets
  where id = source_vault_secret_id;

  return result;
end;
$$;

comment on function private.get_decrypted_source_secret is 'Decrypts and returns one data_source''s stored credential, after checking the caller owns it via private.user_can_access_producer(). Raises rather than returning null/empty for an unauthorized or nonexistent source, so a caller can''t mistake "denied" for "no secret set."';

grant execute on function private.get_decrypted_source_secret(uuid) to authenticated;
