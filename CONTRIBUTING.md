# Contributing / development process

This is a solo project, but it follows a deliberate process rather than
pushing straight to `main` -- partly for its own sake (catching mistakes
before they're live), and partly because the history itself is meant to be
legible to someone reading it later.

## Workflow

1. Create a feature branch (`feat/...`, `fix/...`, `docs/...`).
2. Make the change (a migration, a doc, whatever the branch is for).
3. Push the branch and open a pull request describing what changed and
   why. Reference every file touched by path (as `` `inline code` ``, not
   a hyperlink) -- a relative markdown link resolves against the PR's own
   URL, not the repo tree, so it's broken from the moment it's posted; an
   absolute link to the head branch works during review but breaks the
   moment that branch is deleted after merge, which happens on every
   merge here. A plain path never breaks and is just as easy to open from
   the "Files changed" tab.
4. CI runs automatically (see below). Review the diff.
5. Merge via the PR (squash merge -- see "Merge strategy"). When working
   with Claude Code: it reports the PR's summary, CI/mergeability status,
   and any comments (bot or human) back in chat once the PR is open, so
   review happens there instead of switching to GitHub -- but it only
   merges after an explicit go-ahead each time. Checks passing is never
   itself the go-ahead.
6. **Only after merge**, apply any migration or deploy any Edge Function
   to the live Supabase project. The database (and its server-side
   functions) are never ahead of what's actually merged into `main`.

`main` is protected: pull requests are required, direct pushes (including
by admins) are blocked, and force-pushes/branch deletion are disabled.

## Migrations

- One purpose per migration file. If a migration does two unrelated
  things, split it.
- Filename convention: `YYYYMMDDHHMMSS_description.sql`, timestamp in UTC
  (`date -u +%Y%m%d%H%M%S`). This matches the Supabase CLI's own convention
  and keeps files in application order.
- Migrations live in `supabase/migrations/` and are applied to the linked
  Supabase project only after their PR merges -- never before, and never
  directly against production outside of a migration file.
- After applying a migration, check Supabase's security and performance
  advisors for anything new -- a schema change is the most likely place
  a fresh finding shows up, and it's easy to miss since `execute_sql`
  and other elevated-access checks won't surface it.
- A migration that would destroy real data (`drop column`, `drop table`)
  renames instead of dropping outright -- `alter table x rename column y
  to y_deprecated`, say -- with the actual drop left for its own later
  migration once there's been time to notice if something still needed
  it. The data stays physically present and recoverable in between,
  without any backup infrastructure. This only applies when there's
  something to protect: a drop confirmed empty at migration time (stated
  in the migration's own comment, the way both existing column drops
  already do) can just drop -- there's nothing at risk.

## Working directly against the live database

Verification and testing sometimes means running SQL directly against
the live project outside of a migration -- checking real row counts,
tracing a bug against real data, reconciling a migration version. That's
normal here (see `docs/decisions/0008`), but unlike a migration it skips
PR review entirely, so a mistake has nothing catching it beforehand.

Before any such SQL that writes (not just reads), take a manual snapshot
first -- [`supabase db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump)
or `pg_dump` against the project's connection string, saved locally,
never committed to the repo. This project is on Supabase's Free plan,
which keeps no backups of its own, so there's nothing else to fall back
on. A read-only check doesn't need one; anything that inserts, updates,
or deletes real data does.

## Frontend deploys

Unlike a migration or Edge Function, the app (`app/`) has no manual deploy
step. Vercel is connected directly to this GitHub repo (see
`docs/decisions/0008`): every push to `main` builds and deploys it to
production automatically, and every other branch or PR gets its own
preview build. Merging a PR that touches `app/` *is* the deploy -- there's
nothing further to run.

## Diagrams

`docs/architecture.md` and `docs/data-model.md` each hold one diagram
showing the current state -- never a diff to reconstruct from git
history. When a change actually alters what the diagram shows (not a
wording fix in the surrounding prose), append the diagram being replaced
to a `## History` section at the bottom of the same file, dated, before
updating the live one at the top. Same reason `CHANGELOG.md` keeps every
past release instead of just the latest: seeing how the shape of things
changed over time shouldn't require `git log -p`.

## Edge Functions

- Live in `supabase/functions/<name>/index.ts`, one function per
  directory.
- Same discipline as migrations: written and reviewed in a PR first,
  deployed to the live Supabase project only after merge -- never
  before, and never edited directly on the live project outside of a
  reviewed change to the file in this repo.
- Any secret a function needs (an API key, for example) is set
  directly in Supabase's Edge Function secrets, never committed to the
  repo, never passed through a migration.

## Designing tools for the model

When a tool or prompt doesn't produce the right result, the first fix to
reach for is giving the model more room to figure it out itself -- not a
more specific instruction covering that exact case. A prompt that
accumulates one hand-written rule per failure ("also check the nickname
column", "don't end your SQL in a semicolon") doesn't scale, and it hides
problems that are worth fixing structurally instead. Concretely:

- Prefer one general capability (the chat writing its own SQL,
  `docs/decisions/0016`) over a fixed menu of shapes with a resolver
  behind each one, and prefer letting the model explore for itself
  (querying `information_schema`, sampling real rows) over pre-fetching
  an answer into its context -- a schema description built by us can go
  stale or miss the exact thing that matters; the model looking directly
  at the real data can't.
- When something goes wrong, ask first whether it's a bug in what the
  tool actually *does* (fix the code -- e.g. a query wrapper that chokes
  on a trailing semicolon) before assuming it's a bug in what the model
  was *told* to do (patch the prompt). The first real production use of
  `execute_readonly_query` hit exactly this: a semicolon the wrapper
  couldn't parse was a real bug, fixed once, in the function; guessing
  where a variety name might be recorded was not something to hand-tell
  the model -- it was fixed by telling it to look at the data itself when
  a search comes up empty, which then generalizes to every future case
  like it, not just this one.

## CI

`.github/workflows/db-lint.yml` runs on any PR touching
`supabase/migrations/**`. It starts a local Supabase stack (applying every
migration from scratch) and runs `supabase db lint`, which is the same
check the Supabase security/performance advisors use. A migration that
fails to apply cleanly, or introduces a lint-level issue (e.g. a table
without RLS), fails the PR.

## Architecture Decision Records (ADRs)

Any decision where a reasonable person could have gone a different way,
and where the reasoning is worth preserving, gets a short ADR in
`docs/decisions/`, using [`docs/decisions/template.md`](docs/decisions/template.md).
Not every change needs one -- most migrations don't -- but anything that
took real back-and-forth to settle does.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) style:
`feat:`, `fix:`, `docs:`, `chore:`, etc. Commits made with Claude Code's
help carry a `Co-Authored-By: Claude ...` trailer.

## Merge strategy

This repo only allows **squash and merge**. Every PR becomes exactly one
commit on `main`, regardless of how many intermediate commits happened on
the branch -- `main`'s history reads as one line per feature/fix, not a
diary of every WIP commit.

## Releases

Versions are not cut per PR. Several PRs accumulate on `main` until they
add up to a real milestone, at which point:

1. Check `README.md`, this file, `docs/data-model.md`, and any ADR with a
   placeholder or "not yet decided" left in it against what actually
   shipped in the batch -- not just the CHANGELOG entry. A
   fast-moving batch of PRs reliably leaves the higher-level docs
   describing an earlier version of the project than the one about to
   be tagged; catch that here; don't let it accumulate. Check Supabase's
   security and performance advisors too, so a finding doesn't sit
   unnoticed across a release.
2. A version section is added to [`CHANGELOG.md`](CHANGELOG.md): prose
   that leads with the theme -- why this batch of changes happened --
   and keeps that why running through every paragraph, not just the
   opening line. A paragraph that only lists what changed, without
   saying why it mattered or why that choice was made, needs another
   pass. Not a categorized bullet list.
3. A matching git tag and GitHub Release are published.

See `CHANGELOG.md` for the actual history.
