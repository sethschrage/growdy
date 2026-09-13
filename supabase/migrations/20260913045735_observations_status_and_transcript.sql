-- Adds review support to observations ahead of chat-based submission
-- (docs/decisions/0009): status gates whether a submitted observation
-- counts as confirmed data, and transcript preserves the raw chat
-- exchange it came from, so review can judge whether the AI's
-- interpretation was correct, not just whether the resulting note reads
-- sensibly.
--
-- Every observation imported so far was already reviewed by hand before
-- being typed in -- that review already happened, so existing rows are
-- backfilled to 'approved' rather than defaulting to 'pending' along
-- with everything new.
--
-- No update policy for status yet -- approving/rejecting happens by
-- hand via direct SQL for now (there's no reviewer-role concept in
-- profiles). Add one once reviewing by hand actually becomes the
-- bottleneck, not speculatively now.

alter table public.observations
  add column status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column transcript jsonb;

update public.observations set status = 'approved';

comment on column public.observations.status is 'pending until reviewed by hand; approved/rejected after. Chat-submitted observations start pending.';
comment on column public.observations.transcript is 'Raw chat conversation this observation was resolved from, when it came from the chat-based submission flow (docs/decisions/0009). Null for observations entered directly.';

create policy "observations: member can submit pending observations"
  on public.observations for insert
  with check (
    private.user_can_access_producer(producer_id)
    and status = 'pending'
  );
