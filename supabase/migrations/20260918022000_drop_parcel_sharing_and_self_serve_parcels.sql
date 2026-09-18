-- Parcel sharing and self-serve parcel creation are both removed. 0025
-- shipped the sharing mechanism in 0.10.0; the migration immediately
-- before this one gave it a real UI and fixed a genuine bug in the RLS
-- cascade it depended on. Hours later the first full UAT pass reached
-- it, and the answer was that the feature shouldn't exist: Growdy will
-- sell parcels, and the parcel is the seat. A producer handing a parcel
-- to another producer is a hole in exactly the thing being charged for,
-- and a producer minting unlimited parcels for free is the same hole
-- from the other direction. So both halves of 0025 go. See 0028.
--
-- 0025's own Context saw this coming, in its own words: "parcels and/or
-- users may become billable later... a share must never make a parcel
-- count against more than one producer." That constraint is easiest to
-- honour by not having shares.
--
-- Nothing is lost. Zero shares were ever created, and every parcel in
-- production was created directly against the database.
--
-- This runs deliberately *after* the UI-support migration rather than
-- replacing it. Rewriting history so the feature never existed would
-- leave the audit log referencing a table no migration ever created,
-- and would hide a real decision -- it was built, then withdrawn, and
-- the record should say so.

-- The two SECURITY DEFINER functions the UI called. They resolve a
-- recipient by sign-in email and read parcel_shares, so with the table
-- gone they can only error; left in place they would also keep showing
-- up as "signed-in users can execute SECURITY DEFINER function" in the
-- Supabase advisors, which is how this leftover was caught in the first
-- place.
drop function if exists public.share_parcel(uuid, text, text);
drop function if exists public.get_parcel_shares(uuid);

-- The share branch goes out of the access check while the table it
-- reads still exists. CREATE OR REPLACE rather than drop/create because
-- every policy on parcels, plots, plot_rows, planting and observations
-- resolves through this function -- dropping it would take them with it.
--
-- What's left is the plain tenancy rule 0001 started with: a parcel is
-- yours if it belongs to your producer. The share branch was the only
-- reason this function ever had to look anywhere but profiles. Note
-- that the previous migration's real contribution survives untouched:
-- parcels' own select policy still routes through here, which is the
-- consistency fix it was right about.
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

comment on function private.user_can_access_parcel is 'True when the signed-in user''s producer owns this parcel. Sharing was removed by 0028 -- producers are the only access path, per docs/decisions/0001.';

-- parcel_shares' audit trigger and its dedicated function exist only for
-- this table. The function is the one that had to resolve producer_id
-- through a join to parcels, and had to tolerate a parcel delete
-- cascading to its shares; both of those problems leave with it.
drop trigger if exists audit_parcel_share_change on public.parcel_shares;
drop function if exists public.audit_parcel_share_change();

-- Existing audit_log rows naming this table are deliberately left alone.
-- The audit log records what happened, and rewriting it to pretend a
-- table never existed is the opposite of what it is for.
drop table if exists public.parcel_shares;

-- Self-serve parcel creation, the other half of 0025. A parcel is the
-- billable unit now, so creating one is a purchase, not a text box in
-- the data browser. Both the grant and the policy go: leaving the grant
-- with no policy, or the policy with no grant, would leave a
-- half-open door that reads like an oversight to whoever finds it next.
drop policy if exists "parcels: member can create their own parcels" on public.parcels;
revoke insert on public.parcels from authenticated;

comment on table public.parcels is 'A producer''s named block of land, and the billable seat. Created for a producer by hand (or, later, by a purchase flow) -- authenticated deliberately holds no INSERT grant. Never shared between producers. See docs/decisions/0028.';
