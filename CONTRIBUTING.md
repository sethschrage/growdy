# Contributing / development process

This is a solo project, but it follows a deliberate process rather than
pushing straight to `main` -- partly for its own sake (catching mistakes
before they're live), and partly because the history itself is meant to be
legible to someone reading it later.

## Workflow

1. Create a feature branch (`feat/...`, `fix/...`, `docs/...`).
2. Make the change (a migration, a doc, whatever the branch is for).
3. Push the branch and open a pull request describing what changed and why.
4. CI runs automatically (see below). Review the diff.
5. Merge via the PR (squash merge -- see "Merge strategy").
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

1. Check `README.md`, this file, and `docs/data-model.md` against what
   actually shipped in the batch -- not just the CHANGELOG entry. A
   fast-moving batch of PRs reliably leaves the higher-level docs
   describing an earlier version of the project than the one about to
   be tagged; catch that here; don't let it accumulate.
2. A version section is added to [`CHANGELOG.md`](CHANGELOG.md): a short
   theme -- why this batch of changes happened -- followed by prose
   describing what changed, not a categorized bullet list.
3. A matching git tag and GitHub Release are published.

See `CHANGELOG.md` for the actual history.
