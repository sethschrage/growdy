-- Replaces observations.transcript with a conversation_id FK into
-- conversations (docs/decisions/0011): the two columns were storing the
-- same messages twice, once per submitted observation and once per
-- chat session. Review now follows the FK to see the full session
-- (which also carries per-message thumbs up/down feedback) instead of
-- reading a duplicated copy embedded on the observation row itself.
--
-- Nullable, like transcript was: existing rows predate the chat
-- feature entirely and have no conversation to point at. Zero pending
-- observations and zero populated transcripts exist at the time of
-- this migration, so there is nothing to backfill.
--
-- No slicing/range column for now -- a session producing more than one
-- observation would show every observation's build-up when reviewing
-- any one of them, but "New chat" already starts a fresh conversation
-- id per submission cycle today, so conversation and observation stay
-- roughly one-to-one in practice. Revisit only once real usage (e.g.
-- a merged chat agent letting one session produce several submissions)
-- actually makes that noisy.

alter table public.observations
  add column conversation_id uuid references public.conversations (id);

alter table public.observations
  drop column transcript;
