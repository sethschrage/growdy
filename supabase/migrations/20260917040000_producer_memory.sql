-- Producer memory (docs/decisions/0023): two embedded corpora searched by
-- one new chat tool. producer_memory is a real, producer-visible table;
-- conversation_embeddings is a derived, rebuildable index over
-- conversations.transcript -- conversations itself stays the single
-- source of truth. Embeddings for both are computed on a schedule (same
-- pg_cron + Vault-secret handshake sync-scheduled-weather (0020) and
-- scan-conversations-for-observations (0025 follow-up) already
-- established), never synchronously per chat turn.

create extension if not exists vector with schema extensions;

-- 1024 dimensions: voyage-4-lite's output_dimension, chosen explicitly
-- in every embed call rather than relying on an implicit default -- see
-- supabase/functions/_shared/voyage.ts.
create table public.producer_memory (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  content text not null,
  embedding extensions.vector(1024),
  source text not null default 'manual' check (source in ('manual', 'model-suggested')),
  created_at timestamptz not null default now()
);

comment on table public.producer_memory is 'Real, producer-visible memory entries -- written via the chat write-tool (0022) like any other DML, embedded on a schedule. See docs/decisions/0023.';
comment on column public.producer_memory.embedding is 'Null until the scheduled embedding job (service_role) fills it in -- never set synchronously at write time.';
comment on column public.producer_memory.source is 'manual: the producer typed it directly. model-suggested: the model proposed it mid-conversation, confirmed the same way any other write is.';

create index producer_memory_producer_id_idx on public.producer_memory (producer_id);

alter table public.producer_memory enable row level security;

create policy "producer_memory: member can view their producer's memory"
  on public.producer_memory for select
  using (private.user_can_access_producer(producer_id));

create policy "producer_memory: member can create their own memory entries"
  on public.producer_memory for insert
  with check (private.user_can_access_producer(producer_id));

-- Column-scoped, not a table-level grant -- the profiles.producer_id
-- lesson applies here too: a producer can edit what a memory entry
-- *says*, never its embedding (service_role-only, set only by the
-- scheduled job) or which producer it belongs to.
create policy "producer_memory: member can edit their own memory entries"
  on public.producer_memory for update
  using (private.user_can_access_producer(producer_id))
  with check (private.user_can_access_producer(producer_id));

grant select, insert on public.producer_memory to authenticated;
grant update (content) on public.producer_memory to authenticated;

-- conversation_embeddings: chunked, embedded copies of conversation
-- content. Never written directly by a producer or the model -- only by
-- the scheduled job -- so authenticated gets read access only.
create table public.conversation_embeddings (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  producer_id uuid not null references public.producers (id),
  chunk_text text not null,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now()
);

comment on table public.conversation_embeddings is 'Derived, rebuildable index over conversations.transcript -- conversations stays the single source of truth. Can be dropped and regenerated with zero data loss if the embeddings provider or model ever changes. See docs/decisions/0023.';

create index conversation_embeddings_producer_id_idx on public.conversation_embeddings (producer_id);
create index conversation_embeddings_conversation_id_idx on public.conversation_embeddings (conversation_id);

alter table public.conversation_embeddings enable row level security;

create policy "conversation_embeddings: member can view their producer's embedded conversations"
  on public.conversation_embeddings for select
  using (private.user_can_access_producer(producer_id));

grant select on public.conversation_embeddings to authenticated;

-- Tracks whether a conversation's current transcript has been embedded
-- yet -- same shape as observations' scanned_at (0025 follow-up).
-- Re-embedded whenever updated_at moves past this.
alter table public.conversations add column embedded_at timestamptz;

comment on column public.conversations.embedded_at is 'When the scheduled memory-embedding job last (re-)embedded this conversation into conversation_embeddings. Null means never embedded. Re-embedded if updated_at moves past this. See docs/decisions/0023.';

-- The actual search: embeds nothing itself (the caller already turned
-- the query into a vector via Voyage, in the Edge Function -- Postgres
-- has no way to call an external embeddings API), just ranks both
-- corpora by distance and returns the closest matches, RLS-scoped
-- exactly like any other read (security invoker, no elevation needed --
-- both tables already grant authenticated real SELECT access).
create or replace function public.search_memory_by_embedding(p_query_embedding extensions.vector(1024), p_limit int default 5)
returns table (source_table text, id uuid, content text, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  (
    select 'producer_memory'::text as source_table, pm.id, pm.content, (1 - (pm.embedding <=> p_query_embedding))::float as similarity
    from public.producer_memory pm
    where pm.embedding is not null
    order by pm.embedding <=> p_query_embedding
    limit p_limit
  )
  union all
  (
    select 'conversation_embeddings'::text as source_table, ce.id, ce.chunk_text, (1 - (ce.embedding <=> p_query_embedding))::float as similarity
    from public.conversation_embeddings ce
    where ce.embedding is not null
    order by ce.embedding <=> p_query_embedding
    limit p_limit
  )
  order by similarity desc
  limit p_limit;
$$;

comment on function public.search_memory_by_embedding is 'Ranks producer_memory and conversation_embeddings by vector distance to an already-computed query embedding. RLS-scoped like any other read. Called by the chat Edge Function''s search_memory tool after embedding the query text via Voyage. See docs/decisions/0023.';

grant execute on function public.search_memory_by_embedding(extensions.vector, int) to authenticated;

-- Same handshake shape as observation_scan_trigger_secret (0025 follow-up)
-- and weather_sync_trigger_secret (0020) -- a value Postgres generates at
-- apply-time, never seen or typed by a human.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'memory_embed_trigger_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'memory_embed_trigger_secret',
      'Shared secret proving a request to embed-scheduled-memory really came from this project''s own pg_cron job. See docs/decisions/0023.'
    );
  end if;
end
$$;

-- Mirrors get_conversations_for_observation_scan (0025 follow-up): checks
-- the trigger secret, then hands back producer_memory rows with no
-- embedding yet, across every producer at once -- the same deliberate,
-- narrow cross-producer exception those jobs already established.
create or replace function public.get_pending_memory_entries(p_trigger_secret text, p_limit int default 20)
returns table (id uuid, content text)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  expected_secret text;
begin
  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'memory_embed_trigger_secret';

  if expected_secret is null or p_trigger_secret is null or p_trigger_secret <> expected_secret then
    raise exception 'not authorized: bad or missing trigger secret';
  end if;

  return query
    select pm.id, pm.content
    from public.producer_memory pm
    where pm.embedding is null
    order by pm.created_at asc
    limit p_limit;
end;
$$;

comment on function public.get_pending_memory_entries is 'Checks p_trigger_secret against the Vault-stored memory_embed_trigger_secret and, only if it matches, returns up to p_limit producer_memory rows with no embedding yet. See docs/decisions/0023.';

revoke execute on function public.get_pending_memory_entries(text, int) from public;
grant execute on function public.get_pending_memory_entries(text, int) to service_role;

-- Sets embedding directly -- service_role bypasses RLS, the same
-- deliberate, narrow exception every other scheduled job already uses.
create or replace function public.set_memory_embedding(p_trigger_secret text, p_id uuid, p_embedding extensions.vector(1024))
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  expected_secret text;
begin
  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'memory_embed_trigger_secret';

  if expected_secret is null or p_trigger_secret is null or p_trigger_secret <> expected_secret then
    raise exception 'not authorized: bad or missing trigger secret';
  end if;

  update public.producer_memory set embedding = p_embedding where id = p_id;
end;
$$;

comment on function public.set_memory_embedding is 'Checks p_trigger_secret, then sets one producer_memory row''s embedding. The only way embedding is ever written -- authenticated has no grant on that column at all. See docs/decisions/0023.';

revoke execute on function public.set_memory_embedding(text, uuid, extensions.vector) from public;
grant execute on function public.set_memory_embedding(text, uuid, extensions.vector) to service_role;

-- Mirrors get_conversations_for_observation_scan (0025 follow-up)
-- exactly, applied to embedding instead of observation-scanning.
create or replace function public.get_conversations_for_memory_embedding(p_trigger_secret text, p_limit int default 20)
returns table (id uuid, producer_id uuid, transcript jsonb)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  expected_secret text;
begin
  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'memory_embed_trigger_secret';

  if expected_secret is null or p_trigger_secret is null or p_trigger_secret <> expected_secret then
    raise exception 'not authorized: bad or missing trigger secret';
  end if;

  return query
    select c.id, c.producer_id, c.transcript
    from public.conversations c
    where c.embedded_at is null or c.updated_at > c.embedded_at
    order by c.created_at asc
    limit p_limit;
end;
$$;

comment on function public.get_conversations_for_memory_embedding is 'Checks p_trigger_secret, then returns up to p_limit conversations whose transcript has changed (or never embedded) since conversation_embeddings was last rebuilt for them. See docs/decisions/0023.';

revoke execute on function public.get_conversations_for_memory_embedding(text, int) from public;
grant execute on function public.get_conversations_for_memory_embedding(text, int) to service_role;

-- Replaces this conversation's chunks wholesale and marks it embedded --
-- conversation_embeddings is a derived index, so re-embedding means
-- delete-then-insert, not trying to diff old vs. new chunks.
create or replace function public.replace_conversation_embeddings(
  p_trigger_secret text,
  p_conversation_id uuid,
  p_producer_id uuid,
  p_chunks text[],
  p_embeddings extensions.vector(1024)[]
)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  expected_secret text;
  i int;
begin
  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'memory_embed_trigger_secret';

  if expected_secret is null or p_trigger_secret is null or p_trigger_secret <> expected_secret then
    raise exception 'not authorized: bad or missing trigger secret';
  end if;

  delete from public.conversation_embeddings where conversation_id = p_conversation_id;

  for i in 1 .. array_length(p_chunks, 1) loop
    insert into public.conversation_embeddings (conversation_id, producer_id, chunk_text, embedding)
    values (p_conversation_id, p_producer_id, p_chunks[i], p_embeddings[i]);
  end loop;

  update public.conversations set embedded_at = now() where id = p_conversation_id;
end;
$$;

comment on function public.replace_conversation_embeddings is 'Checks p_trigger_secret, then wholesale-replaces one conversation''s chunks in conversation_embeddings and marks it embedded. See docs/decisions/0023.';

revoke execute on function public.replace_conversation_embeddings(text, uuid, uuid, text[], extensions.vector[]) from public;
grant execute on function public.replace_conversation_embeddings(text, uuid, uuid, text[], extensions.vector[]) to service_role;

-- Recovering memory content isn't time-critical (same reasoning as the
-- 6h observation-scan cadence) -- every 6 hours is plenty.
select cron.schedule(
  'embed-producer-memory-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/embed-scheduled-memory',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'memory_embed_trigger_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) as request_id;
  $$
);
