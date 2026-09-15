-- add_data_source's default backfill_start floor was "now() - interval '5
-- years'", chosen with no stated justification -- Tempest's API exposes no
-- way to discover a station's actual earliest observation date (confirmed
-- against outside sources; still true after 0020), so a 5-year default
-- silently cut off real history for any station older than that, with no
-- signal to the producer that anything was truncated.
--
-- Tempest (WeatherFlow) didn't exist before its Kickstarter launched
-- November 2019, with first units shipping May 2020 -- no station could
-- have observations before that. 2019-01-01 is a safe floor with margin on
-- either side: far enough back that no real Tempest station's history gets
-- truncated, without walking back to an arbitrary date (like the Unix
-- epoch) that would spend years of empty chunks over data that provably
-- can't exist. Still a deliberate conservative floor, not a discovered
-- fact from Tempest's own API -- same reasoning as the original 0019
-- design, just with a better-justified constant.
create or replace function public.add_data_source(
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
    'pending', coalesce(p_backfill_start, '2019-01-01'::timestamptz)
  )
  returning id into new_source_id;

  return new_source_id;
end;
$$;

comment on column public.data_sources.backfill_start is 'The fixed floor date backfill walks down to before being considered complete. Set when the source is added; deliberately not inferred from an empty API response, since an empty response''s real meaning (reached the station''s actual start date, vs. a transient provider hiccup) isn''t something to guess at. Defaults to 2019-01-01 (before Tempest existed) when not given explicitly -- not a discovered fact about any specific station, just a floor no real Tempest station''s history could predate.';
