-- 0027 named this as a known gap: "there's no delete/unshare path yet
-- ... if revocation becomes a real need, it's a delete policy for the
-- owner, not a schema change." The artifacts panel (0.14.0) is that
-- real need -- a saved list with no way to ever remove anything from it
-- is a real gap, not a deferred nice-to-have, once a producer can
-- actually see everything they've shared in one place.

create policy "artifacts: member can delete their own artifacts"
  on public.artifacts for delete
  using (private.user_can_access_producer(producer_id));

grant delete on public.artifacts to authenticated;
