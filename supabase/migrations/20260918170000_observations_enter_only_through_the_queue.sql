-- Closes `0030`: the review queue stops being the way observations
-- happen to be created and becomes the only way they can be.
--
-- The migration that opened this sequence deliberately only expanded.
-- Four paths inserted observations directly at the time -- the chat's
-- "Log this observation" button, the structured observation form,
-- confirming a candidate, and `0022`'s write tool -- and revoking the
-- grant before they moved would have broken each in turn. All four now
-- go through `create_observation_candidate` or
-- `confirm_observation_candidate`, so the grant has nothing left to
-- serve.
--
-- `confirm_observation_candidate` is `security definer`, so it keeps
-- writing after this. That is the whole point: the only INSERT left is
-- one that runs after a producer has looked at the row.
revoke insert on public.observations from authenticated;

drop policy if exists "observations: member can log their producer's observations" on public.observations;

-- SELECT and DELETE stay exactly as they are. `0028` built the
-- observation log and its delete on top of `0022`'s audit trigger, which
-- writes the whole old row into `audit_log` on delete, and none of that
-- changes: review decides what enters the record, deletion decides what
-- stays. They are not alternatives.
--
-- No UPDATE grant existed before this and none is added. An observation
-- is corrected by deleting it, which is recoverable, rather than edited
-- in place, which would leave the audit trail describing a row that no
-- longer says what it said.
comment on table public.observations is 'Dated field notes that count as data. Rows arrive only through confirm_observation_candidate, after a producer has reviewed the candidate (docs/decisions/0030); a producer deletes what they do not want, and 0022''s audit trigger keeps the deleted row recoverable in audit_log.';
