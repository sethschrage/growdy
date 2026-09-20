# 0035. What the docs are checked against, and what cannot be

**Status:** accepted

## Context

[`0034`](0034-a-schema-change-has-to-explain-itself.md) made the
database's own documentation a build failure rather than a habit. The
same argument applies one level up, to the docs in this repo: the rule
that base docs are updated in the same PR as the change
([`AGENTS.md`](../../AGENTS.md), "The one that keeps getting missed") is
a habit, executed at the end of a PR, with auto-merge on and nobody
reviewing. A stale line renders exactly like a fresh one.

The question was not whether to check the docs but *what in them can be
checked*. A survey of every claim in `README.md`, `CONTRIBUTING.md`,
`AGENTS.md`, `docs/architecture.md`, `docs/data-model.md`,
`docs/monitoring.md` and the 34 ADRs produced 44 candidate checks. Ten
survived a pass that tried to break each one against the repo's real
history and contents. Most of the survivors were already failing.

## Decision

**A doc claim is checkable only when something else in the repo can
contradict it without anyone exercising judgement.** That is the whole
rule, and it is what separates the ten from the thirty-four.

Two scripts, split by what they need:

`scripts/check-docs.mjs` needs nothing but the working tree, so it runs
on every PR, gated on nothing: relative links and heading anchors
resolve; a link labelled with an ADR number points at that ADR; ADR
numbers are unique, match their own H1, carry the template's sections,
and -- for an ADR this branch adds -- do not collide with a number
`main` already used; the architecture diagram draws exactly the Edge
Functions that exist; migrations match the filename convention; every
released tag has a CHANGELOG section; and no component reaches past
`app/src/data/` to Supabase.

`scripts/check-docs-db.mjs` rides the throwaway Postgres `db-lint`
already builds, under the same migrations-changed gate: the ER diagram
draws every table, the scheduled jobs in `cron.job` are the ones
documented, and the dashboard's cards name columns that exist.

**Both have their own tests, and those run on every PR.** A checker is
the easiest thing in a repo to fool yourself about: it prints nothing
when it passes, and a regex that has silently stopped matching looks
exactly like a clean build. Every branch in both scripts was
mutation-tested -- broken deliberately, one at a time, to confirm a test
noticed.

## Alternatives

**Require a doc to change when code changes.** The obvious one, and it
is a gate rather than a check: satisfied by touching the file, and red
on the many PRs where nothing went stale. A PR-template checkbox has the
same defect with an extra step, and a free-text "which docs did you
check" answer punishes the author who honestly writes "monitoring.md is
stale, fixing in a follow-up".

**Require a replaced diagram to survive in `## History`.** This one was
convincing until it was replayed over the repo's real history: of 21
past PRs that edited a diagram, 9 would have been blocked, several for
one-line changes, each demanding a ~180-line diagram appended to a file
already at 1,557 lines. The `## History` entries here are epoch markers
tied to ADRs, which is a judgement about what counts as an epoch.

**Match commands quoted in prose against CI's `run:` lines.**
`CONTRIBUTING.md` says the web job "lints (`oxlint`)"; the workflow runs
`npm run lint`, which is oxlint. Both are correct and substring matching
says one is wrong. Its first act would have been a false red build.

**Check that backticked paths in docs exist.** Measured: over the base
docs, 37 paths and zero dead -- no yield where it is safe. Over all
docs, 12 dead and essentially every one deliberate history: ADR 0032
cites the old path of the very file it moved, and the CHANGELOG is an
append-only record. Worthless where it is safe, wrong where it finds
anything.

**Compare the ER diagram column by column.** Requires an ignore list for
`created_at`/`updated_at` to avoid noise, and that list would have
hidden a real omission (`conversations.updated_at`, which
`docs/monitoring.md` leans on). Entities are unambiguous; which audit
columns are convention and which are substance is taste.

**Assert the branch-protection settings quoted in `monitoring.md`.**
That line is a dated "Confirmed on" log entry, not a live claim. Failing
a build because reality moved past an observation is wrong in principle,
and the honest fix -- re-date it after looking -- is not something a
script can decide to do.

## Consequences

- **Four of the ten were failing when they were written**, which is the
  point: three ADR links in `CONTRIBUTING.md` that render as 404s on
  GitHub, an anchor into a section that moved from 8 to 9, a link to
  `Chat.tsx` at the path it had before [`0032`](0032-client-organised-by-feature.md)
  moved it, `app_status` missing from a diagram whose first sentence
  claims "the full set of tables", and a dashboard card querying a
  column [`0028`](0028-what-uat-removed.md) dropped. All fixed here.
- **The docs are now partly load-bearing.** Renaming a section heading
  can fail a build in another file. That is the trade: the alternative
  is the link quietly pointing at the top of the page forever.
- **Most doc drift is still uncaught**, and calling this "documentation
  CI" would be the dangerous reading. Nothing here can tell whether a
  paragraph is still *true*. What it catches is the mechanical half:
  pointers, counts, names and numbers.
- **`docs/vision.md` is referenced eight times and has never existed in
  this repo's history.** Found during the survey; deliberately not
  automated away, because whether it should be committed, rewritten or
  de-referenced is a question about intent rather than about files.
