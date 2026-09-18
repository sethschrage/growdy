-- 0025 shipped the parcel_shares mechanism and its RLS, but never a way
-- for a producer to actually create one -- there's no human-friendly way
-- to identify "the other producer" client-side (shared_with_producer_id
-- is a raw uuid nobody knows), and producers/profiles' own RLS
-- deliberately blocks a cross-producer read, so a plain client-side
-- lookup by email isn't possible either. Two narrow SECURITY DEFINER
-- RPCs close this, the same shape add_data_source/create_producer_and_profile
-- already established for "one specific privileged action needs elevated
-- access" -- never a broader grant to make the client-side query work.

-- Creates or updates a share by the recipient's sign-in email, since
-- that's the only identifier a producer actually has for someone else.
-- Only the parcel's real owner can call this successfully -- checked
-- directly here, not left to RLS, since the insert this performs runs as
-- the function owner and bypasses parcel_shares' own RLS by design.
create or replace function public.share_parcel(p_parcel_id uuid, p_recipient_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_producer_id uuid;
  parcel_owner_id uuid;
  recipient_producer_id uuid;
begin
  if p_role not in ('editor', 'viewer') then
    raise exception 'role must be editor or viewer';
  end if;

  select producer_id into caller_producer_id from public.profiles where id = auth.uid();
  select producer_id into parcel_owner_id from public.parcels where id = p_parcel_id;

  if parcel_owner_id is null or caller_producer_id is null or caller_producer_id <> parcel_owner_id then
    raise exception 'only this parcel''s owner can share it';
  end if;

  -- Resolving by email necessarily reveals whether *an account* exists
  -- for that address if the share fails -- accepted here rather than
  -- built around: this project has no broader promise of email privacy
  -- (Google sign-in already reveals as much through its own account
  -- flows), and the alternative -- silently doing nothing on a typo --
  -- is worse for the one real use this serves today.
  select pr.producer_id into recipient_producer_id
  from auth.users u
  join public.profiles pr on pr.id = u.id
  where lower(u.email) = lower(trim(p_recipient_email))
  limit 1;

  if recipient_producer_id is null then
    raise exception 'no Growdy account found for that email';
  end if;

  if recipient_producer_id = caller_producer_id then
    raise exception 'you can''t share a parcel with your own account';
  end if;

  insert into public.parcel_shares (parcel_id, shared_with_producer_id, role)
  values (p_parcel_id, recipient_producer_id, p_role)
  on conflict (parcel_id, shared_with_producer_id) do update set role = excluded.role;
end;
$$;

comment on function public.share_parcel is 'Creates or updates a parcel_shares row by the recipient''s sign-in email -- the only client-safe way to identify "the other producer," since producers/profiles RLS blocks a direct cross-producer lookup. Owner-only, enforced here since the insert bypasses RLS. See docs/decisions/0025.';

revoke execute on function public.share_parcel(uuid, text, text) from public;
grant execute on function public.share_parcel(uuid, text, text) to authenticated;

-- Returns who a parcel is shared with (owner's view: every share) or who
-- shared it with you (recipient's view: your own row only, matching
-- 0025's own "a share only reveals its own row" rule) -- either way,
-- with a human-readable name/email instead of a bare producer_id,
-- which plain RLS on producers/profiles can't give a client directly.
create or replace function public.get_parcel_shares(p_parcel_id uuid)
returns table(share_id uuid, party_producer_id uuid, party_name text, party_email text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_producer_id uuid;
  parcel_owner_id uuid;
begin
  select producer_id into caller_producer_id from public.profiles where id = auth.uid();
  select producer_id into parcel_owner_id from public.parcels where id = p_parcel_id;

  if parcel_owner_id is null then
    return;
  end if;

  if caller_producer_id = parcel_owner_id then
    return query
      select ps.id, ps.shared_with_producer_id, p.name,
        (select u.email::text from auth.users u join public.profiles pr on pr.id = u.id
         where pr.producer_id = ps.shared_with_producer_id limit 1),
        ps.role
      from public.parcel_shares ps
      join public.producers p on p.id = ps.shared_with_producer_id
      where ps.parcel_id = p_parcel_id;
  else
    return query
      select ps.id, parcel_owner_id, po.name,
        (select u.email::text from auth.users u join public.profiles pr on pr.id = u.id
         where pr.producer_id = parcel_owner_id limit 1),
        ps.role
      from public.parcel_shares ps
      join public.producers po on po.id = parcel_owner_id
      where ps.parcel_id = p_parcel_id
        and ps.shared_with_producer_id = caller_producer_id;
  end if;
end;
$$;

comment on function public.get_parcel_shares is 'Owner sees every share on their own parcel with the recipient''s identity; a share recipient sees only their own row, with the owner''s identity -- never other recipients, matching 0025''s own privacy rule. See docs/decisions/0025.';

revoke execute on function public.get_parcel_shares(uuid) from public;
grant execute on function public.get_parcel_shares(uuid) to authenticated;
