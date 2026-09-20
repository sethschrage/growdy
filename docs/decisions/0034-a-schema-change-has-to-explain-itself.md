# 0034. A schema change has to explain itself

**Status:** accepted

## Context

[`0033`](0033-what-goes-in-the-cached-prompt.md) settled what the chat's
cached prompt holds. This is about where the contents come from, and it
starts from an audit of what the model was actually handed.

The schema description is generated from the catalog at request time,
which [`0016`](0016-chat-queries-directly.md) chose precisely so it
could not drift. It could not drift, and it was also nearly empty of
meaning:

- **Every relation was hand-listed.** A `SCHEMA_RELATIONS` array named
  twelve tables. A thirteenth could be created, populated and shipped
  without ever reaching the model, and nothing would say so -- the chat
  would simply never mention it.
- **Zero of the fourteen foreign keys were included.** The model was
  told `plots` has a `parcel_id` and left to infer, from the name, that
  it pointed at `parcels`. It usually guessed right. "Usually" is the
  problem.
- **Check constraints were retyped by hand into table comments**, where
  they could disagree with the database and eventually would.
- **115 of the 187 public columns had no comment at all**, which renders
  as a well-formed line with a name, a type, and nothing else.

Underneath all four is one cause: nothing ever required a schema change
to explain itself. `CONTRIBUTING.md` asked for a `COMMENT ON`, and that
rule is followed exactly as long as whoever is writing the migration
remembers it and has time.

## Decision

**The chat is told about every public relation by default.** The
hand-kept include-list is gone. What remains is `NOT_DESCRIBED`, a map
from relation name to the reason it stays out -- eight entries today,
each a sentence. A new table now reaches the model the moment its
migration applies: no code change, no redeploy. The failure mode flips
from *silently invisible forever* to *slightly noisy until someone
writes a reason*, and only the second one is self-correcting.

**The description carries what the catalog knows.** Foreign keys as
`joins: parcel_id -> parcels.id`, check constraints as Postgres itself
spells them via `pg_get_constraintdef`, and `[required]` for a column
that is `NOT NULL` with no default. All of it generated, none of it
retypeable into something the database disagrees with.

**A migration that creates a table or view, or adds a column, answers
six questions in its header** -- purpose, what each column means, what
it relates to, who can see it, whether the chat should be told, and what
happens to existing rows
([`docs/schema-change-questions.md`](../schema-change-questions.md)).
They are the questions whose answers exist only in the head of whoever
asked for the change, which is why the moment to ask is before the
migration is written rather than after.

**A hook refuses the write before CI ever sees it.** Added shortly after
the rest of this ADR shipped, in answer to the obvious question: what
forces an agent to ask? Nothing did. `AGENTS.md` said to, which is a
prompt, and CI checked that answers existed, which is satisfied by
inventing them. `.claude/settings.json` now runs
`scripts/migration-write-guard.mjs` as a `PreToolUse` hook, calling the
same `auditMigration()` CI calls, and an unanswered migration cannot be
written at all. It still cannot force the asking -- a rule enforced on
files can only see files -- but the refusal happens in front of the
person who can answer rather than ten minutes later in a log.

**Three checks enforce it, in increasing cost.**
`scripts/check-migration-answers.mjs` needs no database and fails a
missing or placeholder answer, or a `CREATE TABLE` with no `COMMENT ON`
in the same file. `scripts/check-schema-docs.mjs` runs against the
database CI builds from the migrations and fails a described relation
with no table comment, a `NOT_DESCRIBED` entry naming a relation that no
longer exists, and a column backlog larger than
`scripts/schema-docs-baseline.json`. Both checkers have their own tests,
which run on every PR whether or not a migration changed, because a
regex that has silently stopped matching looks exactly like a clean PR.

**The existing backlog is a ratchet, not a flag day.** The spine --
`producers`, `parcels`, `plots`, `plot_rows` -- is documented in the
migration that lands with this. That leaves 47 uncommented columns
across the relations the model sees. Demanding all 47 before the next
PR would get the check deleted; a baseline that may fall and never rise
gets them written by whoever next touches each table.

The ratchet fails in both directions, which is the part that is easy to
get wrong. A count above the baseline is an undocumented column that
shipped. A count *below* it is a PR that documented something and left
the old ceiling in place -- no defect today, and by next month the
backlog has grown back into the slack and nobody remembers it was ever
lower. So that case fails too, with the corrected baseline file printed
ready to paste, because the person who just wrote those comments is the
only one who will ever be positioned to lower the ceiling.

## Alternatives

**Keep the curated include-list and add a CI check for unlisted
tables.** This was the plan until it was written down. It is cheaper in
tokens -- you describe only what you meant to -- but it keeps the
expensive failure: the check tells you a table is unclassified, and the
fix is a code edit and a function deploy. Inverting makes the common
case (a new table the chat should know about) require nothing, and the
rare case (one it shouldn't) require a sentence.

**Require the answers in the PR description instead of the migration.**
PR bodies are not in the repo, do not travel with a `git clone`, and are
not what anyone reads when they open the migration in three years.

**A coverage gate: 100% of columns commented, no exceptions.** With 115
uncommented columns on the day it lands, the realistic outcome is not
115 comments. It is a deleted check.

**A checklist in the PR template.** A checkbox is not an answer, and
nothing verifies a ticked one.

## Consequences

- **Adding a column is deliberately slower.** Six questions is a
  conversation, not a form. The answers are the `COMMENT ON` text, so
  the work is not duplicated -- but "just add a column" is no longer a
  thing that happens between two other tasks.
- **The prompt got bigger.** Describing every relation, with keys and
  constraints, costs more than describing twelve tersely. It sits in the
  first cache block, so a warm request reads it back at a tenth of the
  input rate; the cost lands on the first request after any schema
  change. Measured on the live function: **16,938 tokens**, up from the
  15,240 recorded in [`0033`](0033-what-goes-in-the-cached-prompt.md) --
  1,698 tokens for fourteen foreign keys, the check constraints, the
  required markers and a thirteenth relation. Observed twice, as a
  `cacheWrite` on the first request after the deploy and a `cacheRead`
  on the next.
- **A new table is noisy until somebody excludes it.** That is the
  trade, taken on purpose: noise gets fixed, silence does not.
- **`NOT_DESCRIBED` is now load-bearing.** A rename that does not update
  it silently starts describing a table someone decided to hide. CI
  fails on it, and the function logs it at request time as well, because
  CI only sees what a PR changed.
