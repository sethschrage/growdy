# Contributing / development process

This is a solo project, but it follows a deliberate process rather than
pushing straight to `main` -- partly for its own sake (catching mistakes
before they're live), and partly because the history itself is meant to be
legible to someone reading it later.

That applies to the process itself, not only to the code. A rule settled
in a chat window, a review thread, or somebody's recollection of a
conversation has a half-life of about a week and is invisible to anyone
who wasn't in the room -- including the same person six months later.
Every process decision -- what earns an ADR, what belongs in a release
note, how a number gets claimed -- gets written into this file, or into
the doc it governs, in the same session it's settled, as its own PR.
**If a rule isn't in git, it isn't a rule.** It's a preference, and it
will quietly stop being followed without anyone deciding to drop it.

Writing a rule down isn't the same as it being read, though.
[`AGENTS.md`](AGENTS.md) carries the handful that get skipped most often,
for any coding agent working in this repo. [`CLAUDE.md`](CLAUDE.md) sits
beside it and only points there, because Claude Code auto-loads that
filename; another tool wanting its own entry point gets another pointer,
not another copy. `AGENTS.md` is a pointer too: when a rule here changes
and `AGENTS.md` mentions it, both move in the same PR.

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
   the "Files changed" tab. If the change is visible to a producer using
   the app, add 1-2 short bullets in plain language near the top of the
   description -- not a technical summary, a draft of what will eventually
   go in the release's own bullet list (see "Releases"). Pure refactoring,
   docs, or infrastructure PRs don't need one.
4. **Update every base doc the change makes stale, in the same PR.**
   Not at release time -- by then the person who knew what changed has
   moved on, and the drift is found by whoever is cutting the release,
   if at all. This is the step agents and humans both skip most often,
   so it's mechanical: before opening the PR, ask of each of
   `README.md` (does the Stack table still describe what runs?),
   `docs/architecture.md` (does the diagram still show what talks to
   what? if not, move the old one to `## History` first -- see
   "Diagrams"), `docs/data-model.md`, `docs/monitoring.md`, and any ADR
   this change amends or contradicts. Most PRs make none of them stale
   and the answer is a quick no. The ones that do are exactly the PRs
   where nobody will remember a month later. A PR that changes what the
   project *is* -- a new client, a new deploy path, a new external
   dependency -- has almost certainly made at least one of them wrong.
5. CI runs automatically (see below). Review the diff.
6. Merge via the PR (squash merge -- see "Merge strategy"). GitHub
   auto-merge is on for this repo: once opened, a PR merges itself as soon
   as CI passes, with no separate go-ahead needed per PR. Review happens
   at the release step instead (see "Releases") -- the CHANGELOG entry
   is where a mistake actually gets caught, not a manual look at every
   individual PR. That makes step 4 load-bearing rather than tidy-up:
   with no per-PR review, an unnoticed doc change is merged by the time
   anyone would have looked, and the release check becomes a backstop
   for what step 4 missed rather than the place drift is meant to be
   found. This is a deliberate choice, not
   the default: earlier in this project every PR got an explicit
   confirmation before merging, until the release cadence and doc-drift
   habits below were established well enough to move that review to the
   release instead.
7. **Only after merge**, apply any migration or deploy any Edge Function
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
- **A migration that changes a table, view or function the client reads
  regenerates `app/src/data/schema.ts` in the same PR**
  (`supabase gen types typescript --project-id <id>`, or the Supabase
  MCP server's `generate_typescript_types`). That file is the only
  description of the database the client has, and it is generated, so a
  stale copy does not fail loudly -- it type-checks against a schema
  that no longer exists.
- A migration that adds a table or column includes a `COMMENT ON`
  explaining it, in the same migration -- context captured once, when the
  thing is created, not researched and retrofitted later by whoever needs
  it next (see [`0018`](decisions/0018-plant-types-common-name.md), which
  had to do exactly that retrofit for two views that had shipped with no
  column comments at all). This isn't "write it once and never touch it
  again" -- a comment that turns out incomplete or wrong gets corrected
  the same way, via its own `COMMENT ON` in a later migration, same as any
  other schema refinement. The rule is against shipping *undocumented*,
  not against improving the documentation over time.
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

For anything riskier than that -- a migration, a direct fix expected to
take a few minutes -- flip on the maintenance flag first
(`update app_status set maintenance = true, message = '...'`,
`docs/decisions/0017`), and flip it back (`maintenance = false`) once
done. Every open tab, and anyone trying to sign in, sees a hard block
within 30 seconds instead of using the app while it's mid-change --
including another agent session that might otherwise act on stale
assumptions about what's currently live.

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

## Tests

The client is tested with [Vitest](https://vitest.dev) and Testing
Library, configured inside `app/vite.config.ts` so tests resolve and
transform through the same pipeline the build uses. `npm test` in
`app/` runs them; `npm run test:watch` while working. Tests sit beside
what they test, as `x.test.ts` next to `x.ts`.

The project reached `0.13.0` in its first seven days without a single
test, and the cost showed up in one place repeatedly: the chat's scroll
area needed fixing in four separate PRs in that week (#180, #181, #187,
#189), each verified by hand once and never again. These rules are
about where a test actually pays, not about a number:

- **Every exported function in `app/src/data/` and `app/src/lib/` has
  unit tests.** These are the pure-logic and data-access layers -- the
  places where a wrong answer is silent, and the places the rest of the
  app is about to be built on.
- **Every bug fix ships a test that fails without the fix**, whenever
  the bug is reachable from a test. Write it before the fix and watch it
  fail: a regression test that has never been red is a guess about what
  was broken.
- **A component gets a behaviour test where its behaviour branches** --
  empty, error, loading, gated, disabled. Not every component, and not
  the shape of its markup.
- **No snapshot tests.** A snapshot that breaks gets blessed rather than
  read, so it records what the code did rather than what it should do.
- **Touching an untested file brings it under test in the same PR.**
  There is no backfill milestone; coverage arrives where work already
  is. A file nobody has needed to touch in months is not where the next
  bug is.

There is no coverage threshold, deliberately. A number rewards testing
what is easy to reach rather than what is expensive to get wrong, and
the rules above name the risky parts outright.

## CI

Two workflows, both running on every PR, both required:

`.github/workflows/web.yml` typechecks (`tsc -b`), lints (`oxlint`) and
runs the test suite for `app/`. None of those three ran in CI before it
existed, so a PR touching only the client was auto-merged on the
strength of a schema check that never looked at it.

`.github/workflows/db-lint.yml` starts a local Supabase stack (applying
every migration from scratch) and runs `supabase db lint`, the same
check the Supabase security/performance advisors use. A migration that
fails to apply cleanly, or introduces a lint-level issue (e.g. a table
without RLS), fails the PR. The lint steps are skipped internally for a
PR that touches no migration, but the workflow itself still runs -- a
required check has to report on every PR or it blocks them forever.

## Architecture Decision Records (ADRs)

Any decision where a reasonable person could have gone a different way,
and where the reasoning is worth preserving, gets a short ADR in
`docs/decisions/`, using [`docs/decisions/template.md`](docs/decisions/template.md).
Not every change needs one -- most migrations don't.

Effort is not the trigger. Plenty of ordinary work takes a long time to
get right: a bug with one correct answer, buried three layers down in
somebody else's SDK, can eat a whole afternoon and still leave nothing
to decide. That belongs in a comment next to the code it explains, so
the next person reading that line doesn't repeat the afternoon.

What earns an ADR is a live alternative -- a fork where the other branch
was defensible and someone could reasonably propose taking it later. A
decision like that is worth writing down even if it was settled in a
minute, because the cost is re-litigating it in six months, not the time
it took today.

### Claiming a number

ADR numbers are sequential, so two branches open at the same time will
both reach for the next free one and neither will notice until they're
both on `main`. Check for a newer ADR immediately before opening the PR
rather than when you started writing, and renumber if one landed in
between -- the earlier merge keeps the number.

The number is the cheap half of that problem. An ADR written against a
`main` that has since moved can end up describing a road not taken that
the repo has, in fact, since taken. `0029` argued we'd passed on a PWA
in favour of the iOS shell; `0028`'s PR had shipped the home-screen
install while `0029` sat on a branch. A stale ADR asserting the
opposite of what the code does is worse than no ADR, so re-read the
decision itself against current `main`, not just the filename.

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

Versions are not cut per PR. **The trigger is producer-visible impact,
not a schedule or a PR count**: as soon as a merged PR ships a feature
or a real change in behavior a producer would notice -- not a bug fix
-- a release gets cut so the "What's new" popup actually reaches them
close to when it shipped, not whenever a batch happens to feel big
enough. Bug fixes, small internal enhancements, refactors, docs, and
infrastructure-only PRs don't trigger one on their own; they keep
merging and simply ride along in whichever release is already due
next. Several of those can still accumulate between releases -- this
isn't one release per feature PR -- but a real feature never sits
unreleased (and unannounced in the app) waiting for enough small stuff
to pile up alongside it. When it's time to cut one:

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
   pass. Not a categorized bullet list. **This is the engineering
   record** -- it documents *why*, references PR numbers and ADRs by
   name, and is never shown inside the app.
3. A matching git tag and GitHub Release are published. **The Release's
   body is not the CHANGELOG entry** -- it's a separate, short bullet
   list (four or more bullets), written for the producer using the app,
   not for another engineer: one real, user-visible change per bullet
   ("Chat can now search the web when it needs current information," not
   "wired in `web_search_20260318`"), plain language, no PR numbers, no
   ADR references, no internal names. Draw from the 1-2 bullets each
   merged PR's own description already sketched (see "Workflow") rather
   than re-deriving them from scratch. **This is the only release
   content a producer ever sees** -- the app's own "What's new" popup
   (`ReleaseNotes.tsx`) fetches this body directly from GitHub and
   renders it as-is (markdown, so a real bulleted list). The title is
   never just the bare version -- it's `vX.Y.Z -- <short theme phrase>`,
   a noun-phrase pulled from the CHANGELOG entry's own opening theme
   (e.g. `v0.7.0 -- The chat writes and runs its own SQL`), so the
   release list itself is legible without opening each one.
   **Group the bullets under `Frontend` / `Backend` / `Infra` headers**
   (omit any that don't apply that release) -- a bullet's category is
   decided by where the change is actually visible, not by what kind of
   code changed: `Frontend` is a new or changed screen, button, or
   in-chat element a producer can see and use directly; `Backend` is a
   real capability or behavior change reachable through *existing* UI
   (a smarter chat answer, a new tool it can use) with nothing new to
   click; `Infra` is real but has zero producer-visible effect on its
   own (a security fix, a schema change, a scheduled job, CI). Verify
   the split against the actual frontend code (`app/src/`) rather than
   assuming a feature shipped with a UI just because its ADR or PR
   title describes it that way -- confirmed necessary directly: `0025`'s
   parcel sharing has had a real database mechanism since `0.10.0` and
   still has no UI anywhere in the app as of `0.12.0`, reachable only by
   asking the chat to do it once the write tool itself became real.
   Small, purely cosmetic bug fixes can be collapsed into one closing
   "General improvements and bug fixes" line instead of one bullet each;
   a bug fix worth a producer knowing about on its own (a security fix,
   something that was silently broken) still gets its own bullet under
   whichever category it affects.

   **A bullet has to be something this release changed about the app,
   materially.** Not "would a producer care" -- that question drags in
   things that aren't changes at all. A failing external dependency, a
   backlog draining, an outage in progress: real, worth fixing, and
   background plumbing from inside the app. Those belong in
   `docs/monitoring.md` or in a fix, never in a release note. The test
   is whether the app itself is materially different because this batch
   merged.

   **Nothing gets announced before it launches.** A feature that has
   merged but cannot yet be reached -- behind a flag, awaiting an App
   Store review, built but not deployed -- gets no bullet in any
   category, including `Infra`, and no hedged "groundwork is in place"
   line either. Every bullet renders in the app's own "What's new", so
   a bullet for something unreachable either reads as available and
   isn't, or spends a producer's attention on something they can't use.
   It gets its bullet in the release where it actually becomes
   reachable, which is also when it reads as news rather than as a
   progress report. The engineering record for it goes in `CHANGELOG.md`
   and its ADR at merge time, as usual -- this rule is about the
   producer-facing body only.

See [`CHANGELOG.md`](CHANGELOG.md) for the full engineering history, and
the GitHub Releases page (or the app's own "What's new") for what a
producer actually sees.
