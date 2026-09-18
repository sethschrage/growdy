-- Parcel sharing is removed, not fixed. 0025 shipped the mechanism in
-- 0.10.0 and it never got a UI; the write tool becoming real in 0.12.0
-- made it reachable by asking the chat, and nothing ever used it -- zero
-- rows in production at the time of this migration. The reason it is
-- going rather than getting the screen it was missing is commercial:
-- Growdy will sell parcels, and the parcel is the seat. Letting one
-- producer hand a parcel to another is a hole in exactly the thing being
-- charged for, so the right move is to not have the feature at all.
--
-- 0025 covered parcel sharing *and* self-serve parcel creation. Only the
-- sharing half is withdrawn here; parcels are still created by their own
-- producer. See 0025's own Status note for the amendment.

-- The share branch goes out of the access check first, while the table
-- it reads still exists. CREATE OR REPLACE rather than drop/create
-- because every policy on plots, plot_rows, planting and observations
-- resolves through this function -- dropping it would take them with it.
--
-- What's left is the plain tenancy rule 0001 started with: a parcel is
-- yours if it belongs to your producer. Worth noting how much simpler
-- the check gets -- the share branch was the only reason this function
-- had to look anywhere but profiles.
create or replace function private.user_can_access_parcel(target_parcel_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.parcels p
    where p.id = target_parcel_id
      and private.user_can_access_producer(p.producer_id)
  );
$$;

comment on function private.user_can_access_parcel is 'True when the signed-in user''s producer owns this parcel. Sharing was removed (see 20260918010000) -- producers are the only access path, per docs/decisions/0001.';

-- The audit trigger and its function exist only for this table. The
-- function is the one that had to resolve producer_id through a join to
-- parcels, and had to tolerate a parcel delete cascading to its shares;
-- both of those problems leave with it.
drop trigger if exists audit_parcel_share_change on public.parcel_shares;
drop function if exists public.audit_parcel_share_change();

-- Existing audit_log rows naming this table are deliberately left alone.
-- The audit log is a record of what happened, and rewriting history to
-- pretend a table never existed is the opposite of what it's for -- even
-- though, as it happens, there is nothing here to keep.
drop table if exists public.parcel_shares;
