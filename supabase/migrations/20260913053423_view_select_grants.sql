-- planting_readable and position_status were both missing a plain
-- select grant to authenticated -- a basic table/view-level privilege
-- check that happens before row-level security is even evaluated, not
-- something RLS policies substitute for. Without it, Postgres denies
-- the query outright, which looked identical to "zero rows" from the
-- client's perspective since nothing had surfaced the actual error.
--
-- This went unnoticed since every view read so far happened through an
-- elevated connection that bypasses this check entirely -- the first
-- real signed-in user to query planting_readable (via the chat-based
-- observation flow, docs/decisions/0009) hit it immediately. Exactly
-- the kind of gap the app exists to surface, per docs/decisions/0008.
--
-- Once granted, access is still correctly scoped -- both views are
-- plain (not security definer) views over tables whose own RLS
-- policies already check private.user_can_access_producer(producer_id).

grant select on public.planting_readable to authenticated;
grant select on public.position_status to authenticated;
