# 0030. Every observation enters through one review queue

**Status:** accepted (amends 0028, which amended 0009)

## Context

`0028` removed the review gate on observations eleven days into the project's real use, and the reasoning was sound: `observations.status` had no `UPDATE` grant and no `UPDATE` policy, so nothing could ever move a row from `pending` to `approved`. All 211 rows were `approved` by the column's own backfill and not one had ever been `pending`. What `0.3.0` announced to producers as "held for review" was a gate with no gatekeeper, and a real field note logged through the chat would have sat pending forever.

Two things have changed since, and together they reopen the question rather than reverse that finding.

Photo attachment in chat is being built. A photo gets analysed at upload with the producer's own context in view -- their plantings, their weather, their memory -- so the analysis is far more useful than a generic caption, and also far more confident. Those analyses feed `producer_memory`, memory is recalled when the chat interprets the *next* photo, and a misread early in a season can quietly confirm itself across the ones that follow. A context loop does not degrade randomly; it drifts in one direction, and the drift arrives wearing the producer's own data.

And the queue that `0028` found broken is not the only one in the project. `observation_candidates` has existed since `0.11.0` with `status` and `reviewed_at`, the app already reviews it, and confirming a candidate already writes an observation. The mechanism `0028` wanted and could not find was already running beside it.

## Decision

**`observation_candidates` becomes the only way into `observations`.** Not a second gate on the `observations` table -- that is what `0028` correctly killed, and re-adding a status column would rebuild the same trap. `observations` keeps its current meaning, rows that count, and the queue becomes the single door.

**The reason is curation, not correctness.** This matters because the obvious rationale does not actually cover the whole decision. The drift argument above is strong for anything a model authored and weak for a note the producer typed themselves -- they are the ground truth for their own vineyard, and gating their own note protects nothing from drift. It is gated anyway, because a deliberate pass over what enters the permanent record was wanted for every source, not because a producer's field note is suspect. Recorded as a preference so a later reader doesn't find the safety argument and notice it fits only half the cases.

**The queue widens rather than the observations table narrowing.** `conversation_id` becomes nullable, since a typed note and a photo from the observation form have no conversation behind them. `note`, `observed_date`, `planting_id` and `photo_path` join `summary`, so confirming builds a real observation instead of copying a one-line summary into `note` and discarding everything else -- which is what the client does today. A `source` column records which path proposed the row (`chat_scan`, `photo`, `producer`, `chat_tool`), because who proposed something is what decides how much scrutiny it deserves at review.

**Confirming becomes one transaction.** `confirm_observation_candidate` replaces the two client statements that insert the observation and then mark the candidate, with nothing holding them together: a failure in between left an observation whose candidate still read `pending`, so confirming again produced a duplicate. It is idempotent on non-pending candidates, so a double-tap on a slow connection is a no-op rather than an error a producer has to interpret.

**Nothing is revoked in the first migration.** Four paths inserted observations directly -- `LogObservationCard`, `ObservationForm`, the candidate confirm, and `0022`'s write tool, which reaches `observations` through the caller's own grant. Revoking before those moved would have broken each in turn, so the opening migration only expanded and the withdrawal came last, once every caller went through the queue.

**Now closed.** `authenticated` holds no `INSERT` grant on `observations` and the insert policy is gone, so `confirm_observation_candidate` is the only writer left -- `security definer`, running after a producer has looked at the row. The queue is no longer the way observations happen to be created; it is the only way they can be.

## Consequences

- **The "Log this observation" button from `0.13.0` stops logging directly.** It files a candidate instead. That is the second behaviour change to that feature in as many releases, and it is a real cost of this decision, not an oversight.
- **A producer now has to approve their own typed note**, which is friction with no safety justification behind it. If that proves annoying in real use, the honest fix is to let `source = 'producer'` skip the queue, and this ADR should be amended rather than the rule quietly bent.
- **Deleting stays the correction mechanism after approval.** `0028` built the observation log and the delete path on top of `0022`'s audit trigger, which writes the whole old row into `audit_log`. Review before and deletion after are not alternatives here; the queue decides what enters the record and the log decides what stays.
- **`photo_metadata` on `observations` finally has a use.** It has been a nullable column reserved since `0009` deferred photo attachment; a confirmed photo candidate writes its storage path there.
- **The queue is now load-bearing in a way it was not.** When it was only the 6-hourly scanner's output, an unreviewed candidate meant a missed suggestion. It now stands between every field note and the data, which is exactly the shape `0028` warned about -- the difference being that this gate has a gatekeeper, reachable in the app, and confirmed by the migration that builds it.
