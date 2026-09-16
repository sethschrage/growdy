-- Advisor findings from the write-tool (0022) and parcel-sharing (0025)
-- migrations, fixed immediately rather than left to accumulate -- this
-- project's own standing practice, checked right after those migrations
-- applied.

-- audit_row_change is a trigger function only, never meant to be called
-- directly -- CREATE FUNCTION grants EXECUTE to PUBLIC by default, the
-- exact gap #101/#95 already found once for the Vault helper functions,
-- left open here by the same oversight. Revoking doesn't affect the
-- trigger itself, which fires under the function's own SECURITY DEFINER
-- privileges regardless of who triggered the underlying DML.
revoke execute on function public.audit_row_change() from public;

-- Real foreign keys with no covering index -- the same class of gap
-- 0.5.0's own release already named once (a covering index missing until
-- that release's pre-tag advisor check caught it).
create index audit_log_producer_id_idx on public.audit_log (producer_id);
create index audit_log_pending_write_id_idx on public.audit_log (pending_write_id);
create index pending_writes_producer_id_idx on public.pending_writes (producer_id);

-- Two permissive SELECT policies on parcel_shares evaluate both for every
-- query; combining into one with an OR preserves identical access logic
-- (multiple permissive policies are already implicitly ORed) while
-- letting Postgres plan it as a single check.
drop policy "parcel_shares: owner can view shares on their own parcels" on public.parcel_shares;
drop policy "parcel_shares: recipient can view their own share" on public.parcel_shares;

create policy "parcel_shares: owner sees all, recipient sees their own"
  on public.parcel_shares for select
  using (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_shares.parcel_id
        and private.user_can_access_producer(p.producer_id)
    )
    or private.user_can_access_producer(shared_with_producer_id)
  );
