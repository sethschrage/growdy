-- The three observation-photo policies resolve the caller once, like
-- every other policy in this schema already does.
--
-- 0036 rewrote thirty policies across fourteen tables out of this shape:
--
--   using (private.user_can_access_producer(producer_id))
--
-- which takes the row's own column, so a SECURITY DEFINER call runs once
-- per row. On weather_observations -- 143,588 rows -- that measured
-- 1,500ms against 15ms for the hoisted form, and is the reason a weather
-- question used to spend eight model turns working around a 5-second
-- statement timeout.
--
-- It missed these three because they are in `storage`, and
-- scripts/check-rls-shape.mjs -- written in the same PR to stop the shape
-- coming back -- reads nspname = 'public' only. So the check that exists
-- to catch this has never been able to see the last three instances of
-- it. That is fixed alongside this, or the gap simply waits.
--
-- Free today and not later: nine objects in the bucket. storage.objects
-- is the one table here that grows with every photo a producer takes, so
-- this is the same curve 0036 measured, earlier on it.
--
-- BEHAVIOUR IS UNCHANGED, and that was tested rather than reasoned about.
-- private.user_can_access_producer(t) is
-- `exists (select 1 from profiles where id = auth.uid() and producer_id = t)`,
-- and the hoisted form compares the same producer against
-- current_producer_id(). Against the nine real objects, with a real
-- profile's uid in request.jwt.claims: the old predicate matched 9, the
-- new matched 9, and the rows where they disagreed were 0. With a uid
-- belonging to no profile, both matched 0. On a path whose first segment
-- is not a uuid -- storage_object_producer returns null there -- both
-- returned false. The null cases fail closed either way: `exists(...
-- producer_id = null)` finds nothing, and `null = anything` is null,
-- which a policy treats as false.
--
-- All three, not two. The upload policy carries the same call in its
-- WITH CHECK rather than its USING, which is easy to miss by reading
-- pg_policy.polqual alone.

alter policy "observation photos: read own producer's"
  on storage.objects
  using (
    bucket_id = 'observation-photos'
    and private.storage_object_producer(name) = (select private.current_producer_id())
  );

alter policy "observation photos: delete own producer's"
  on storage.objects
  using (
    bucket_id = 'observation-photos'
    and private.storage_object_producer(name) = (select private.current_producer_id())
  );

alter policy "observation photos: upload under own producer"
  on storage.objects
  with check (
    bucket_id = 'observation-photos'
    and private.storage_object_producer(name) = (select private.current_producer_id())
  );
