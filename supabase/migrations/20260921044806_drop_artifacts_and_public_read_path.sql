-- The artifacts feature goes, in full: the model drawing an SVG inline
-- in a chat reply, the producer saving it, and the /a/<id> link a
-- signed-out browser could open. 0027 built all three.
--
-- Not a refactor, and nothing is left behind a flag. Growdy is moving to
-- a native SwiftUI iOS client, and the share link is a web page the
-- producer has no way to reach from the app they actually open. Their
-- verdict on the two saved graphics was that they "aren't good anyways",
-- and a capability nobody has reached for is not one to carry into a
-- rewrite. If a question turns out to need a picture, it gets built
-- again, for the client that exists then.

-- The function goes outright. It destroys no data -- it is a read path,
-- and the rename rule protects rows, not definitions. It is also the
-- only anon-reachable read path in this project, which is worth removing
-- on its own the same week two unauthenticated-access holes were closed
-- (20260921040000, and the guard added to the Edge Functions).
drop function if exists public.get_public_artifact(uuid);

-- The table is RENAMED, not dropped, and that is the rule rather than a
-- preference: a migration that would destroy real data renames instead,
-- with the drop left for its own later migration once there has been
-- time to notice that something still needed it (CONTRIBUTING.md,
-- "Migrations"). The carve-out is for a drop confirmed empty at
-- migration time. This table holds two rows, so it does not apply.
--
-- Both rows are untitled test records from 2026-09-17 and 2026-09-18,
-- written while 0027 was being built, and the producer has said they can
-- go. That is a good reason to schedule the drop, and not a reason to
-- skip the window: the window exists precisely because "somebody said it
-- was fine" is the assumption it is there to catch. The data stays
-- physically present and recoverable in the meantime, with nothing
-- reading it -- every client reference was removed in the same PR.
alter table public.artifacts rename to artifacts_deprecated;

comment on table public.artifacts_deprecated is
  'Tombstone. The artifacts feature was removed entirely (0027 withdrawn); this table is kept only for the window CONTRIBUTING requires before a drop that would destroy real data. Nothing reads it. Drop it in its own migration.';
