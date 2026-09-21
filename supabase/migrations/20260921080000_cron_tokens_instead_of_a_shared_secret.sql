-- The cron trigger secrets stop being long-lived, because every signed-in
-- user can read them for about a second, three times a day.
--
-- 0020 authorizes the three scheduled Edge Functions with a shared secret
-- minted into Vault by migration: the cron job reads it and sets it as an
-- X-Cron-Secret header, and a SECURITY DEFINER function compares the
-- header against Vault before doing anything. The claim in 0020 is that
-- the value is "never seen by a human". That is true of the Vault row and
-- false of the header.
--
-- pg_net stores each queued request whole -- url, headers, body -- in
-- net.http_request_queue until its background worker drains the row, which
-- takes about a second. Verified on the live project: `authenticated` has
-- USAGE on the net schema and SELECT on that table, and the table has no
-- RLS (relrowsecurity = false). So a signed-in producer, or the chat model
-- itself through execute_readonly_query, polling that table across the top
-- of the hour captures weather_sync_trigger_secret in plaintext, and at the
-- six-hour marks the other two.
--
-- Growdy cannot close that door. net.http_request_queue is owned by
-- supabase_admin and migrations run as postgres; a
-- `revoke all on net.http_request_queue from public` was attempted inside a
-- DO block and rejected, with the ACL unchanged afterwards. The grant is
-- the platform's and only the platform can revoke it.
--
-- WHAT A CAPTURED SECRET IS ACTUALLY WORTH, because the fix should be
-- proportionate. All three functions return counts and nothing else --
-- {synced, errors}, {scanned, candidatesCreated, errors}. No producer data
-- is returned to a caller. What a replay buys is the ability to make the
-- project spend money (Tempest, Anthropic, Voyage) and to put spurious
-- candidates in a producer's review queue. Real, bounded, and not
-- exfiltration.
--
-- So: make the captured value expire. The cron job sends an HMAC over the
-- secret name and a five-minute bucket rather than the secret itself, and
-- the verifier recomputes it. The Vault secret never enters pg_net. A token
-- lifted out of the queue is worth five to ten minutes instead of forever,
-- and the attacker still has to be polling at the second the row exists.
--
-- Five minutes and not one: these functions call their verifier repeatedly
-- through a run -- replace_conversation_embeddings once per conversation --
-- and the jobs carry a 90 second timeout. A window that expires mid-run
-- would turn this into an outage on a schedule. Two buckets are accepted so
-- a run that begins near a boundary does not fail on its second call.
--
-- One verifier, not six copies. The check below was copy-pasted into six
-- functions, which is the same shape as the claim in 0020 that `chat`
-- authorized itself: six places to keep true, and nothing that notices when
-- one of them stops being.

create or replace function private.cron_trigger_token(p_secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(
      p_secret_name || ':' ||
        (floor(extract(epoch from clock_timestamp()) / 300))::bigint::text,
      (select decrypted_secret from vault.decrypted_secrets where name = p_secret_name),
      'sha256'
    ),
    'hex'
  )
$$;

comment on function private.cron_trigger_token(text) is
  'What a cron job sends instead of the Vault secret: an HMAC over the secret name and the current five-minute bucket. pg_net stores the header where any signed-in user can read it, so what goes in there has to be worth nothing by the time they read it.';

create or replace function private.cron_token_valid(p_secret_name text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_bucket bigint;
begin
  if p_token is null then
    return false;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_secret_name;

  if v_secret is null then
    return false;
  end if;

  v_bucket := floor(extract(epoch from clock_timestamp()) / 300)::bigint;

  -- The current bucket and the one before it. A run that starts at
  -- 10:04:58 makes its later calls in the next bucket, and rejecting
  -- those would be an outage every five minutes rather than a control.
  return p_token = encode(extensions.hmac(p_secret_name || ':' || v_bucket::text, v_secret, 'sha256'), 'hex')
      or p_token = encode(extensions.hmac(p_secret_name || ':' || (v_bucket - 1)::text, v_secret, 'sha256'), 'hex');
end;
$$;

comment on function private.cron_token_valid(text, text) is
  'The one place a scheduled caller is authorized. Was six copies of a comparison against Vault; six places to keep true is how 0020 came to claim that chat authorized itself when it did not.';

revoke execute on function private.cron_trigger_token(text) from public;
revoke execute on function private.cron_token_valid(text, text) from public;

-- The six verifiers, each swapping its own copy of the Vault comparison
-- for the one verifier above. Nothing else in these bodies changes: they
-- were read back with pg_get_functiondef and the substitution was made
-- mechanically, so what is below is what is live today minus the check.

CREATE OR REPLACE FUNCTION public.get_conversations_for_memory_embedding(p_trigger_secret text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, producer_id uuid, transcript jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
begin
  if not private.cron_token_valid('memory_embed_trigger_secret', p_trigger_secret) then
    raise exception 'not authorized: bad or missing trigger token';
  end if;

  return query
    select c.id, c.producer_id, c.transcript
    from public.conversations c
    where c.embedded_at is null or c.updated_at > c.embedded_at
    order by c.created_at asc
    limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_conversations_for_observation_scan(p_trigger_secret text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, producer_id uuid, transcript jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
begin
  if not private.cron_token_valid('observation_scan_trigger_secret', p_trigger_secret) then
    raise exception 'not authorized: bad or missing trigger token';
  end if;

  return query
    select c.id, c.producer_id, c.transcript
    from public.conversations c
    where c.scanned_at is null or c.updated_at > c.scanned_at
    order by c.created_at asc
    limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_enabled_weather_sources_for_sync(p_trigger_secret text)
 RETURNS TABLE(id uuid, producer_id uuid, external_id text, backfill_status text, backfill_cursor timestamp with time zone, backfill_start timestamp with time zone, last_synced_at timestamp with time zone, api_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
begin
  if not private.cron_token_valid('weather_sync_trigger_secret', p_trigger_secret) then
    raise exception 'not authorized: bad or missing trigger token';
  end if;

  return query
    select ds.id, ds.producer_id, ds.external_id, ds.backfill_status,
           ds.backfill_cursor, ds.backfill_start, ds.last_synced_at,
           vs.decrypted_secret as api_key
    from public.data_sources ds
    join vault.decrypted_secrets vs on vs.id = ds.vault_secret_id
    where ds.enabled = true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_pending_memory_entries(p_trigger_secret text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, content text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
begin
  if not private.cron_token_valid('memory_embed_trigger_secret', p_trigger_secret) then
    raise exception 'not authorized: bad or missing trigger token';
  end if;

  return query
    select pm.id, pm.content
    from public.producer_memory pm
    where pm.embedding is null
    order by pm.created_at asc
    limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_conversation_embeddings(p_trigger_secret text, p_conversation_id uuid, p_producer_id uuid, p_chunks text[], p_embeddings vector[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'extensions'
AS $function$
begin
  if not private.cron_token_valid('memory_embed_trigger_secret', p_trigger_secret) then
    raise exception 'not authorized: bad or missing trigger token';
  end if;

  delete from public.conversation_embeddings where conversation_id = p_conversation_id;

  for i in 1 .. array_length(p_chunks, 1) loop
    insert into public.conversation_embeddings (conversation_id, producer_id, chunk_text, embedding)
    values (p_conversation_id, p_producer_id, p_chunks[i], p_embeddings[i]);
  end loop;

  update public.conversations set embedded_at = now() where id = p_conversation_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_memory_embedding(p_trigger_secret text, p_id uuid, p_embedding vector)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'extensions'
AS $function$
begin
  if not private.cron_token_valid('memory_embed_trigger_secret', p_trigger_secret) then
    raise exception 'not authorized: bad or missing trigger token';
  end if;

  update public.producer_memory set embedding = p_embedding where id = p_id;
end;
$function$;

-- And the three jobs stop reading Vault into a header.

select cron.alter_job(
  job_id := 2,
  command := $job$
    select net.http_post(
      url := 'https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/sync-scheduled-weather',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', private.cron_trigger_token('weather_sync_trigger_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    ) as request_id;
  $job$
);

select cron.alter_job(
  job_id := 3,
  command := $job$
    select net.http_post(
      url := 'https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/scan-conversations-for-observations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', private.cron_trigger_token('observation_scan_trigger_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    ) as request_id;
  $job$
);

select cron.alter_job(
  job_id := 4,
  command := $job$
    select net.http_post(
      url := 'https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/embed-scheduled-memory',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', private.cron_trigger_token('memory_embed_trigger_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    ) as request_id;
  $job$
);
