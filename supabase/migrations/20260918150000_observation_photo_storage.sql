-- The first use of Supabase Storage in this project. README has listed
-- it as "reserved for photo attachments, deliberately not wired up yet"
-- since `0009` deferred them; `0030` brings them back, so the bucket
-- gets built with the same default-deny posture every table here
-- already has.
--
-- Private, not public. A vineyard photo carries the producer's own
-- operation in it -- what is planted, how it is doing, and in a
-- recognisable place -- which is exactly the class of content `0027`
-- was careful about when it opened the project's only signed-out
-- surface. A public bucket would make every uploaded photo readable by
-- anyone holding (or guessing) a URL, with no way to take it back short
-- of deleting the object. Reads go through short-lived signed URLs
-- instead, minted per request for a caller who already passed RLS.
insert into storage.buckets (id, name, public)
values ('observation-photos', 'observation-photos', false)
on conflict (id) do nothing;

-- Object names are '<producer_id>/<uuid>.<ext>'. Putting the producer id
-- in the first path segment is what makes tenancy checkable at all --
-- storage.objects has no producer column to scope on, so the path is
-- the only thing a policy can read. storage.foldername() splits it, and
-- every policy below checks segment 1 through the same
-- user_can_access_producer() every table in this schema already uses,
-- rather than inventing a second notion of who owns what.
--
-- The cast is guarded. A malformed name would make '...'::uuid raise
-- inside policy evaluation, and an erroring policy is a worse failure
-- than a denying one -- so anything that isn't a well-formed uuid in
-- segment 1 simply fails the check.
create or replace function private.storage_object_producer(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_first text := (storage.foldername(object_name))[1];
begin
  return v_first::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on function private.storage_object_producer(text) from public;
grant execute on function private.storage_object_producer(text) to authenticated;

create policy "observation photos: read own producer's"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'observation-photos'
    and private.user_can_access_producer(private.storage_object_producer(name))
  );

create policy "observation photos: upload under own producer"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'observation-photos'
    and private.user_can_access_producer(private.storage_object_producer(name))
  );

-- Delete, but deliberately no update. Replacing an object in place would
-- let the evidence behind an already-confirmed observation change after
-- the fact while its row still reads the same path -- the audit trail
-- `0022` builds would record nothing, because no row changed. Removing
-- and re-uploading produces a new path, which the observation does not
-- silently inherit.
create policy "observation photos: delete own producer's"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'observation-photos'
    and private.user_can_access_producer(private.storage_object_producer(name))
  );
