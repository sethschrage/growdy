-- Closes a gap that's existed since day one: nothing ever creates a
-- producers/profiles row for a new sign-in. Every existing profile was
-- inserted by hand outside the app; a brand-new Google sign-in today
-- gets an auth.users row and nothing else, and every feature that
-- assumes profiles.producer_id exists breaks silently.
--
-- authenticated holds no INSERT grant on either table (confirmed: only
-- SELECT), so this is a SECURITY DEFINER RPC, the same shape
-- add_data_source (0019) already established for "one narrow, atomic,
-- self-service action that needs elevated privilege for exactly one
-- purpose" -- not a general opening of either table to direct inserts.

create or replace function public.create_producer_and_profile(p_producer_name text, p_full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_producer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized: no signed-in user';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'a profile already exists for this account';
  end if;

  if p_producer_name is null or btrim(p_producer_name) = '' then
    raise exception 'producer name is required';
  end if;

  insert into public.producers (name) values (btrim(p_producer_name)) returning id into new_producer_id;
  insert into public.profiles (id, producer_id, full_name) values (auth.uid(), new_producer_id, nullif(btrim(p_full_name), ''));

  return new_producer_id;
end;
$$;

comment on function public.create_producer_and_profile is 'Onboarding entry point: creates a new producer and attaches the calling user to it as its only member. Fails if the caller already has a profile -- one-time use per account. See docs/decisions/0026.';

revoke execute on function public.create_producer_and_profile(text, text) from public;
grant execute on function public.create_producer_and_profile(text, text) to authenticated;
