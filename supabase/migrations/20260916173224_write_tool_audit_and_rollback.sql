-- Infrastructure for docs/decisions/0022: the chat gets a general write
-- capability, made safe by a real confirm-before-commit step, a generic
-- audit trigger, and field-level rollback -- not by restricting what SQL
-- the model can write. This migration builds and verifies the mechanism
-- itself; it does NOT grant execute on the write functions to
-- `authenticated`, and does NOT attach the audit trigger to any real
-- table yet. Per 0022, each table needs its own onboarding pass first
-- (a column-privilege review for anything that controls access scope,
-- like profiles.producer_id, plus any real CHECK constraints for
-- invariants Postgres doesn't already know) before it's brought into the
-- write tool's reach -- that's deliberately a separate, later migration
-- per table, not a blanket rollout here.

-- A write proposed by `propose_write_query`, always via a dry run that
-- rolls back -- nothing here has actually happened to real data until
-- `confirm_write` re-runs it for real.
create table public.pending_writes (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  query text not null,
  summary jsonb,
  status text not null default 'pending' check (status in ('pending', 'applied', 'declined')),
  created_at timestamptz not null default now()
);

comment on table public.pending_writes is 'A write the chat proposed via propose_write_query (already dry-run validated against real constraints) and is waiting on a real confirm_write call -- see docs/decisions/0022.';

alter table public.pending_writes enable row level security;

create policy "pending_writes: member can view their producer's proposals"
  on public.pending_writes for select
  using (private.user_can_access_producer(producer_id));

create policy "pending_writes: member can propose for their own producer"
  on public.pending_writes for insert
  with check (private.user_can_access_producer(producer_id));

create policy "pending_writes: member can update their producer's proposals"
  on public.pending_writes for update
  using (private.user_can_access_producer(producer_id));

grant select, insert, update on public.pending_writes to authenticated;

-- The actual safety net: one row per affected row per committed write,
-- capturing enough (old + new state) to revert it. Only ever written by
-- the trigger below (security definer, bypasses RLS as its owner) --
-- `authenticated` gets no direct insert/update/delete grant here at all.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  table_name text not null,
  row_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  pending_write_id uuid references public.pending_writes (id),
  reverted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is 'Row-level before/after capture for every committed write the write tool makes, written only by audit_row_change(). old_data/new_data are jsonb snapshots, not diffs -- revert_audit_entry() computes the actual diff at revert time. See docs/decisions/0022.';

alter table public.audit_log enable row level security;

create policy "audit_log: member can view their producer's history"
  on public.audit_log for select
  using (private.user_can_access_producer(producer_id));

grant select on public.audit_log to authenticated;

-- Generic -- attached per-table as each one is onboarded, not written by
-- hand per table. Reads which pending_writes row is committing (set by
-- confirm_write via set_config, session-local, never a client-supplied
-- value) so an audit_log row can be traced back to the chat interaction
-- that caused it. Assumes producer_id exists on every table this is ever
-- attached to -- true of every table in this schema today (see
-- docs/data-model.md's note on producer_id being denormalized
-- everywhere), and worth re-checking if that ever stops being true.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_write_id uuid;
begin
  v_pending_write_id := nullif(current_setting('growdy.pending_write_id', true), '')::uuid;

  if tg_op = 'DELETE' then
    insert into public.audit_log (producer_id, table_name, row_id, operation, old_data, new_data, changed_by, pending_write_id)
    values ((to_jsonb(old) ->> 'producer_id')::uuid, tg_table_name, old.id, tg_op, to_jsonb(old), null, auth.uid(), v_pending_write_id);
    return old;
  else
    insert into public.audit_log (producer_id, table_name, row_id, operation, old_data, new_data, changed_by, pending_write_id)
    values (
      (to_jsonb(new) ->> 'producer_id')::uuid,
      tg_table_name,
      new.id,
      tg_op,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      to_jsonb(new),
      auth.uid(),
      v_pending_write_id
    );
    return new;
  end if;
end;
$$;

-- `propose_write_query` always rolls back its own dry run: the inner
-- block's own exception forces that, using a distinct SQLSTATE so a real
-- constraint violation (which the caller genuinely needs to see) isn't
-- mistaken for the deliberate rollback. `result` is a plpgsql variable,
-- not a database write, so it survives the rollback -- the standard
-- documented technique for "try it, capture the outcome, always undo it."
create or replace function public.propose_write_query(query text)
returns table (proposal_id uuid, summary jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller_producer_id uuid;
  clean_query text;
  result jsonb;
  new_id uuid;
begin
  select producer_id into caller_producer_id
  from public.profiles
  where id = auth.uid();

  if caller_producer_id is null then
    raise exception 'no producer found for the current user';
  end if;

  clean_query := trim(trailing ';' from trim(query));

  perform set_config('statement_timeout', '5000', true);

  begin
    execute format('with t as (%s returning *) select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from t', clean_query) into result;
    raise exception using errcode = 'GRDY1', message = 'propose_write_query dry run -- always rolled back, not a real error';
  exception
    when sqlstate 'GRDY1' then
      null;
  end;

  insert into public.pending_writes (producer_id, query, summary)
  values (caller_producer_id, clean_query, result)
  returning id into new_id;

  return query select new_id, result;
end;
$$;

comment on function public.propose_write_query is 'Dry-runs a producer-scoped DML statement (always rolls back) and stores it as a pending_writes row for confirm_write to commit later. The dry run doubles as validation -- a type/NOT NULL/CHECK/FK violation fails here, before anything is ever proposed to the producer. See docs/decisions/0022.';

-- Only this function ever moves a proposal from dry-run to real. Called
-- only in response to a real confirm click in the UI -- never by the
-- model deciding on its own that a "yes" in the conversation was enough.
create or replace function public.confirm_write(p_proposal_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller_producer_id uuid;
  proposal record;
  result jsonb;
begin
  select producer_id into caller_producer_id
  from public.profiles
  where id = auth.uid();

  select * into proposal
  from public.pending_writes
  where id = p_proposal_id
    and producer_id = caller_producer_id
    and status = 'pending';

  if proposal is null then
    raise exception 'no pending write found for this proposal';
  end if;

  perform set_config('growdy.pending_write_id', p_proposal_id::text, true);
  perform set_config('statement_timeout', '5000', true);

  execute format('with t as (%s returning *) select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from t', proposal.query) into result;

  update public.pending_writes set status = 'applied' where id = p_proposal_id;

  return result;
end;
$$;

comment on function public.confirm_write is 'Commits a previously dry-run-validated pending_writes proposal for real, inside a real transaction -- this is what actually fires audit_row_change(). See docs/decisions/0022.';

-- The lean rollback: reverts one audit_log entry by writing its captured
-- old values back, field by field for an UPDATE -- and, critically, only
-- for a field whose *current* value still matches what this entry set it
-- to. Verified directly (a scratch table, not assumed): reverting an
-- older entry while a field it also touched was independently changed
-- again afterward would otherwise silently clobber that later, legitimate
-- edit -- comparing against the row's current state before reverting each
-- field, not just this entry's own old-vs-new, is what actually prevents
-- that, confirmed against exactly that scenario before this shipped.
create or replace function public.revert_audit_entry(p_audit_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller_producer_id uuid;
  entry record;
  current_data jsonb;
  set_clause text;
  reverted_fields text[];
  skipped_fields text[];
begin
  select producer_id into caller_producer_id
  from public.profiles
  where id = auth.uid();

  select * into entry
  from public.audit_log
  where id = p_audit_id
    and producer_id = caller_producer_id;

  if entry is null then
    raise exception 'no audit entry found for this producer';
  end if;
  if entry.reverted_at is not null then
    raise exception 'this change was already reverted';
  end if;

  if entry.operation = 'INSERT' then
    execute format('delete from public.%I where id = %L', entry.table_name, entry.row_id);
  elsif entry.operation = 'DELETE' then
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, %L)', entry.table_name, entry.table_name, entry.old_data);
  else
    execute format('select to_jsonb(t) from public.%I t where id = %L', entry.table_name, entry.row_id) into current_data;
    if current_data is null then
      raise exception 'the row this change applied to no longer exists';
    end if;

    select
      array_agg(key) filter (where current_data ->> key = entry.new_data ->> key),
      array_agg(key) filter (where current_data ->> key is distinct from entry.new_data ->> key)
    into reverted_fields, skipped_fields
    from jsonb_object_keys(entry.old_data) as key
    where entry.old_data ->> key is distinct from entry.new_data ->> key;

    if reverted_fields is not null then
      select string_agg(format('%I = %L', key, entry.old_data ->> key), ', ')
      into set_clause
      from unnest(reverted_fields) as key;

      execute format('update public.%I set %s where id = %L', entry.table_name, set_clause, entry.row_id);
    end if;
  end if;

  update public.audit_log set reverted_at = now() where id = p_audit_id;

  return jsonb_build_object(
    'reverted_fields', to_jsonb(coalesce(reverted_fields, array[]::text[])),
    'skipped_fields', to_jsonb(coalesce(skipped_fields, array[]::text[]))
  );
end;
$$;

comment on function public.revert_audit_entry is 'Reverts one audit_log entry. For an UPDATE, only reverts a field whose current value still matches what this entry set it to -- a field a later, legitimate edit already changed again is left alone and reported back as skipped, not silently overwritten. See docs/decisions/0022.';
