-- The review gate on observations is removed. 0009 introduced it and
-- 0.3.0 announced it to producers by name ("every submission is held for
-- review before it counts as official data"), so this is a real reversal
-- and worth being exact about why.
--
-- It was never once used, and could not have been. Every observation in
-- production is 'approved' -- all 211 of them, set by this column's own
-- backfill when it shipped -- and not one row has ever been 'pending'.
-- There is no UPDATE grant and no UPDATE policy on the table, so nothing
-- in the app or the chat can move an observation from pending to
-- approved; the migration that added the column said as much in a
-- comment and left it for later. Later never came. What shipped was a
-- gate with no gatekeeper: had anyone actually logged an observation
-- through the chat, it would have sat pending forever, invisible to the
-- research data it was meant to become.
--
-- The replacement is the producer's own judgment, applied after the fact
-- instead of before it: observations are logged as they are made, and
-- the producer deletes the ones they don't want. This is safe in a way
-- that is easy to miss -- observations carry 0022's audit trigger, which
-- writes the entire old row into audit_log on delete. A deleted
-- observation is recoverable in full. Nothing is actually thrown away,
-- so "let them delete it" costs less than a review queue that stops real
-- field notes from ever counting.

-- The INSERT policy required status = 'pending', so it has to go before
-- the column it checks. The replacement is just the tenancy rule.
drop policy if exists "observations: member can submit pending observations" on public.observations;

create policy "observations: member can log their producer's observations"
  on public.observations for insert
  with check (private.user_can_access_producer(producer_id));

-- 'pending'/'approved'/'rejected' described a workflow that no longer
-- exists. Dropping the column rather than leaving it defaulted means no
-- later reader has to work out whether it means anything.
alter table public.observations drop column if exists status;

-- Deleting is now the whole correction mechanism, so it needs a real
-- grant and a real policy. Scoped exactly like the select and insert
-- rules above: your producer's observations, nobody else's. No column
-- scoping to do -- a delete takes the row or it doesn't.
grant delete on public.observations to authenticated;

create policy "observations: member can delete their producer's observations"
  on public.observations for delete
  using (private.user_can_access_producer(producer_id));

comment on table public.observations is 'Dated field notes, logged as they are made. No review step -- a producer deletes what they don''t want, and 0022''s audit trigger keeps the deleted row recoverable in audit_log. See docs/decisions/0009 and its amendment.';
