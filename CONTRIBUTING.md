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
6. **Only after merge**, apply any migration to the live Supabase project.
   The database is never ahead of what's actually merged into `main`.

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

1. A version section is added to [`CHANGELOG.md`](CHANGELOG.md): a short
   theme -- why this batch of changes happened -- followed by prose
   describing what changed, not a categorized bullet list.
2. A matching git tag and GitHub Release are published.

See `CHANGELOG.md` for the actual history.
