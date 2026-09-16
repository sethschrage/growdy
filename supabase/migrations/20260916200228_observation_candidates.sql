-- A real answer to docs/vision.md's still-open "how does new data get in
-- now that chat can't submit it" question -- not a new submission path,
-- but recovering what's already sitting in past conversations. A
-- scheduled job (same pg_cron + pg_net + Vault-secret-handshake pattern
-- 0020 already established for weather) reads new/changed conversations,
-- asks Claude whether each one actually describes a field observation,
-- and -- only when it does -- creates a candidate for the producer to
-- confirm or dismiss themselves. Nothing lands in `observations` without
-- that human confirmation; this is a review queue, not a second
-- submission flow.

alter table public.conversations add column scanned_at timestamptz;

comment on column public.conversations.scanned_at is 'When scan-conversations-for-observations last classified this conversation. Null means never scanned. Re-scanned if updated_at moves past this. See docs/decisions/0025 follow-up work.';

create table public.observation_candidates (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  producer_id uuid not null references public.producers (id),
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

comment on table public.observation_candidates is 'A candidate observation extracted from a past conversation by scan-conversations-for-observations -- surfaced for the producer to confirm (creates a real observations row) or dismiss. Never written to observations automatically.';

create index observation_candidates_producer_id_idx on public.observation_candidates (producer_id);
create index observation_candidates_conversation_id_idx on public.observation_candidates (conversation_id);

alter table public.observation_candidates enable row level security;

create policy "observation_candidates: member can view their producer's candidates"
  on public.observation_candidates for select
  using (private.user_can_access_producer(producer_id));

-- Reviewing a candidate (confirm or dismiss) is the only thing a producer
-- ever changes here -- status and reviewed_at, never summary or which
-- conversation it came from. Column-scoped from the start, the same
-- lesson the profiles.producer_id gap taught this project the hard way.
create policy "observation_candidates: member can review their producer's candidates"
  on public.observation_candidates for update
  using (private.user_can_access_producer(producer_id))
  with check (private.user_can_access_producer(producer_id));

grant select on public.observation_candidates to authenticated;
grant update (status, reviewed_at) on public.observation_candidates to authenticated;

-- Same handshake shape as weather_sync_trigger_secret (0020) -- a value
-- Postgres generates at apply-time, never seen or typed by a human. A
-- distinct secret per scheduled job, not reused, so revoking one never
-- touches the other.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'observation_scan_trigger_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'observation_scan_trigger_secret',
      'Shared secret proving a request to scan-conversations-for-observations really came from this project''s own pg_cron job. See docs/decisions/0025 follow-up work.'
    );
  end if;
end
$$;

-- Mirrors get_enabled_weather_sources_for_sync (0020): checks the trigger
-- secret, and only if it matches, hands back every conversation due for a
-- scan across every producer at once -- the same deliberate, narrow
-- cross-producer exception 0020 already established, not a new class of
-- risk.
create or replace function public.get_conversations_for_observation_scan(p_trigger_secret text, p_limit int default 20)
returns table (
  id uuid,
  producer_id uuid,
  transcript jsonb
)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  expected_secret text;
begin
  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'observation_scan_trigger_secret';

  if expected_secret is null or p_trigger_secret is null or p_trigger_secret <> expected_secret then
    raise exception 'not authorized: bad or missing trigger secret';
  end if;

  return query
    select c.id, c.producer_id, c.transcript
    from public.conversations c
    where c.scanned_at is null or c.updated_at > c.scanned_at
    order by c.created_at asc
    limit p_limit;
end;
$$;

comment on function public.get_conversations_for_observation_scan is 'Checks p_trigger_secret against the Vault-stored observation_scan_trigger_secret and, only if it matches, returns up to p_limit conversations due for a scan across every producer. See docs/decisions/0025 follow-up work.';

revoke execute on function public.get_conversations_for_observation_scan(text, int) from public;
grant execute on function public.get_conversations_for_observation_scan(text, int) to service_role;

-- Every conversation due for a scan gets checked every 6 hours -- this is
-- recovering old data, not time-critical the way weather freshness is, so
-- a slower cadence than the hourly weather job is deliberate, not an
-- oversight.
select cron.schedule(
  'scan-conversations-for-observations-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/scan-conversations-for-observations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'observation_scan_trigger_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) as request_id;
  $$
);
