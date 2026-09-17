-- parcel_shares' own pass through 0022's write-tool onboarding checklist --
-- the one table 20260917100000 deliberately excluded, since it has no
-- producer_id column of its own (only shared_with_producer_id, the
-- recipient -- see 0025), and the generic audit_row_change() trigger's
-- fixed assumption doesn't fit it.
--
-- Column-privilege review: already correct, nothing to revoke here.
-- pg_policies confirms only a parcel's owner can insert/update/delete a
-- share (via a join to parcels.producer_id) -- never the recipient,
-- who only ever gets select. The existing UPDATE grant to authenticated
-- is already scoped to role alone (parcel_id/shared_with_producer_id
-- aren't updatable), so a share can't be silently reassigned to a
-- different parcel or recipient after creation.
--
-- Constraint review: parcel_shares_role_check already covers the one
-- real invariant (role in ('editor', 'viewer')). Nothing new needed.
--
-- Audit attribution: a share touches two producers (the owner, via
-- parcel_id -> parcels.producer_id, and the recipient), but only the
-- owner can ever write to this table, so the owner is the one producer
-- who could plausibly need to see or revert this entry.
-- audit_row_change() resolves producer_id straight off the row itself;
-- this table needs a join instead, so it gets its own small trigger
-- function rather than bending the generic one to cover two shapes.
--
-- Real bug caught by scratch-testing before this shipped: deleting a
-- parcel cascades (ON DELETE CASCADE) to its shares, and by the time
-- this trigger fires for that cascaded delete, the parcels row is
-- already invisible to a plain SELECT -- the join resolves to null,
-- which would otherwise crash the NOT NULL constraint on
-- audit_log.producer_id and break parcel deletion itself whenever a
-- share existed. Confirmed directly (a first attempt without the null
-- check failed exactly this way), fixed by skipping the audit insert
-- when the owner can't be resolved -- a share disappearing along with
-- its own parcel isn't independently revertible anyway (there'd be no
-- parcel left to revert it onto).
create or replace function public.audit_parcel_share_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_write_id uuid;
  v_producer_id uuid;
begin
  v_pending_write_id := nullif(current_setting('growdy.pending_write_id', true), '')::uuid;

  select p.producer_id into v_producer_id
  from public.parcels p
  where p.id = coalesce(new.parcel_id, old.parcel_id);

  if v_producer_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    insert into public.audit_log (producer_id, table_name, row_id, operation, old_data, new_data, changed_by, pending_write_id)
    values (v_producer_id, tg_table_name, old.id, tg_op, to_jsonb(old), null, auth.uid(), v_pending_write_id);
    return old;
  else
    insert into public.audit_log (producer_id, table_name, row_id, operation, old_data, new_data, changed_by, pending_write_id)
    values (
      v_producer_id,
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

comment on function public.audit_parcel_share_change is 'parcel_shares'' own audit trigger -- resolves producer_id via a join to parcels (the owner), since the row itself has no producer_id column. Skips auditing (rather than erroring) when the owner parcel can''t be resolved, which happens specifically when a parcel delete cascades to its shares. See docs/decisions/0022.';

-- audit_row_change() already has no PUBLIC execute (confirmed via
-- pg_proc.proacl -- '{postgres=X/postgres}' -- even though the original
-- 0022 migration never explicitly revoked it, apparently a project-level
-- default already in place). This function didn't inherit that
-- automatically; made explicit here rather than relying on whatever
-- implicit default did or didn't apply. A trigger function has no
-- business being callable directly by anon/authenticated via
-- /rest/v1/rpc -- only ever fired by its own trigger.
revoke execute on function public.audit_parcel_share_change() from public;

create trigger audit_parcel_share_change
  after insert or update or delete on public.parcel_shares
  for each row execute function public.audit_parcel_share_change();
