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

One thing to know before reading the rest, because it changes what
several of these rules cover: growdy has two clients. The iOS app is
being rebuilt as a native SwiftUI client and becomes the full-featured
one; the React app in `app/` is frozen as a desktop surface; everything
below the user interface -- schema, RLS, Edge Functions, auth, prompts
-- is shared by both
([`0038`](docs/decisions/0038-the-phone-gets-its-own-client.md), and
`AGENTS.md` opens with the short version). Sections here that are the
React client's say so. None of them has a native equivalent yet, and
the honest state of that is "not decided", not "the same as `app/`".

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
   "Diagrams"), `docs/data-model.md`, `docs/monitoring.md`, any ADR
   this change amends or contradicts, and [`AGENTS.md`](AGENTS.md) plus
   this file (did this change a rule, or the thing a rule describes?).
   The last two were on no staleness list until 2026-09-21, which is
   why the `--no-verify-jwt` hazard in step 7 spent a release living
   only in `docs/monitoring.md`: the process files are the one pair
   nothing mechanical can check, since a stale rule reads exactly like
   a working one. Most PRs make none of them stale
   and the answer is a quick no. The ones that do are exactly the PRs
   where nobody will remember a month later. A PR that changes what the
   project *is* -- a new client, a new deploy path, a new external
   dependency -- has almost certainly made at least one of them wrong.
5. CI runs automatically (see below). Review the diff.
6. Merge via the PR (squash merge -- see "Merge strategy"). **Auto-merge
   is requested on the PR as it is opened** -- `gh pr merge <n> --auto
   --squash` -- so it merges itself the moment CI goes green, with no
   separate go-ahead needed per PR. The repo setting only *permits*
   that; it does not do it. Three PRs sat green and open on 2026-09-19
   while this file claimed they would merge themselves, which is the
   kind of wrong a doc check cannot catch: the claim is about GitHub's
   behaviour, not about a file. **The release PR is the exception** and
   is merged by hand, because Releases step 2 puts a producer in front
   of the running app before anything is tagged, and that is the one
   review this process has. Since that exchange happens in the working
   session, **a release PR that is green and clean is not a release PR
   that is ready** -- nothing in its body or checks reports whether
   anybody has opened the app yet, and there is no longer a checklist
   sitting in the description to make the wait visible. Auto-merge on a
   release PR would tag an unexercised build without anyone deciding
   to. Review happens
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

   **A function deploy carries `--no-verify-jwt`, every time:**

   ```
   supabase functions deploy <name> --no-verify-jwt
   ```

   (add `--project-ref fostmbhpnhjzhulphxzp` if this machine's CLI
   isn't linked; through the Supabase MCP server it is
   `deploy_edge_function` with `verify_jwt: false`, whose default is
   `true` and whose own description argues for leaving it that way.)

   All six functions run with the gateway's JWT check off, for two
   unrelated reasons -- `chat`, `ingest-weather` and
   `add-weather-source` have to answer their own CORS preflight, and
   `sync-scheduled-weather`, `scan-conversations-for-observations` and
   `embed-scheduled-memory` are called by `pg_cron`, which is not a
   signed-in user. Each one authorizes itself instead
   ([`docs/monitoring.md`](docs/monitoring.md), section 6). Deploying
   the ordinary way silently turns the check back on for that function,
   which 401s the preflight for the first three and every cron run for
   the last three -- and nothing catches it: the flag is a deploy-time
   argument, not a value in this repo, so no migration, no CI job and
   none of Supabase's advisors can see it.

   Check that the flag stuck rather than assuming it did. For the three
   a browser calls, an unauthenticated preflight is the discriminating
   test -- the function answers `OPTIONS` itself with a 200, and a 401
   means the gateway answered instead and every request from the app is
   already dead:

   ```
   curl -sS -o /dev/null -w '%{http_code}\n' -X OPTIONS \
     https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/<name>
   ```

   The three `pg_cron` calls have no preflight to read, so for those the
   flag comes back from the Supabase API (`list_edge_functions` through
   the MCP server) -- the only way to see it without deploying.

   Worth running on all six either way: an unauthenticated `POST` must
   answer 401, which is the function's *own* guard turning away a
   stranger. That one reads the same whichever way the flag is set,
   which is exactly why it is a separate check -- `chat` answered
   anonymous POSTs on this project's Anthropic key from its first
   deploy until 2026-09-21.

   ```
   curl -sS -o /dev/null -w '%{http_code}\n' \
     -X POST https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/<name> \
     -H "content-type: application/json" -d '{}'
   ```

   **Except when the live function is the only place a change can be
   verified.** Some Edge Function work cannot be checked anywhere else:
   prompt caching only reports cache hits against the real API,
   streaming only breaks against a real model, and an Edge Function
   failing in production cannot be reproduced on a branch, because
   there are no branch deploys for functions on this plan. Deploying
   first to find out whether a thing works -- and then opening the PR
   with the measurement in it -- produces a better PR than shipping an
   unverified claim and finding out afterwards.

   The conditions, all of them:

   - It is an Edge Function. **Migrations are never exempt**: a
     migration applied before review is a schema change nobody agreed
     to, and it is the one thing here that cannot be rolled back by
     redeploying.
   - The PR goes up the same session, carrying what the deploy
     measured, and says at the top that it was deployed first and why.
   - The previous version is a redeploy away, and you are willing to do
     that if review goes badly.
   - Fixing a function that is already live and broken is not a
     deviation at all -- that is an incident, and the live fix comes
     first.

   This is written down because it happened twice in one day before it
   was a rule, and a rule broken twice in a day is either wrong or
   missing a case. This one was missing a case.

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
- **The advisors are a backstop for one shape of grant mistake, not for
  grant mistakes.** The anon-callable lint is
  `anon_security_definer_function_executable` and it fires on `SECURITY
  DEFINER`. Every one of the seven functions found open to `anon` in
  `#243` -- including `execute_readonly_query`, which takes a SQL string
  -- was `SECURITY INVOKER`, so the lint could not see any of them, and
  would not have in any release. `scripts/check-anon-reach.mjs` is what
  covers that: it reads the resulting ACL out of the database rather than
  the migration text, and keys on reachability by `anon` rather than on
  how a function is declared.
- **A migration that changes a table, view or function the client reads
  regenerates `app/src/data/schema.ts` in the same PR**
  (`supabase gen types typescript --project-id <id>`, or the Supabase
  MCP server's `generate_typescript_types`). That file is the only
  description of the database the client has, and it is generated, so a
  stale copy does not fail loudly -- it type-checks against a schema
  that no longer exists.
- **A migration that creates a table or view, or adds a column, answers
  the six questions in
  [`docs/schema-change-questions.md`](docs/schema-change-questions.md)
  in a comment block at the top of the file** -- purpose, what each
  column means, what it relates to, who can see it, whether the chat is
  told about it, and what happens to existing rows. The answers come
  from whoever asked for the change, so the questions get asked *before*
  the migration is written, not filled in afterwards by whoever is
  holding the keyboard. `scripts/check-migration-answers.mjs` fails the
  PR on a missing or placeholder answer; it cannot tell a good answer
  from a bad one, only that somebody was asked. A `PreToolUse` hook in
  [`.claude/settings.json`](.claude/settings.json) applies the same rule
  earlier still: an agent writing an unanswered migration has the write
  itself refused, in the session, while the person who knows the answers
  is still there. **That file is committed, which means it runs
  `scripts/migration-write-guard.mjs` on your machine** whenever an agent
  edits a migration here -- it reads the proposed contents, writes
  nothing, and fails open if anything about it goes wrong.
- **The chat is told about every public relation by default.** Its
  system prompt is generated from the live catalog at request time, so a
  new table reaches the model the moment its migration applies -- no
  code change, no redeploy. Keeping one *out* is the decision that takes
  an edit: a reason in `NOT_DESCRIBED` in
  `supabase/functions/chat/index.ts`, in the same PR
  ([`0033`](docs/decisions/0033-what-goes-in-the-cached-prompt.md),
  [`0034`](docs/decisions/0034-a-schema-change-has-to-explain-itself.md)).
- A migration that adds a table or column includes a `COMMENT ON`
  explaining it, in the same migration -- context captured once, when the
  thing is created, not researched and retrofitted later by whoever needs
  it next (see [`0018`](docs/decisions/0018-plant-types-common-name.md), which
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

This describes the React client in `app/`, which is one of two clients
and the one that is frozen
([`0038`](docs/decisions/0038-the-phone-gets-its-own-client.md)). How a
native build reaches the producer's phone is a different path with
almost no automation in it, and none of what follows applies to it --
see Releases step 2 for what exists today.

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
- Written and reviewed in a PR first, deployed to the live Supabase
  project after merge, and never edited directly on the live project
  outside of a reviewed change to the file in this repo.
- **Deployed with `--no-verify-jwt`, all six of them, every time**:
  `supabase functions deploy <name> --no-verify-jwt`. The CLI turns the
  gateway's JWT check back on for anything deployed without it, and
  these functions are built to run with it off and authorize
  themselves, so the ordinary command breaks the CORS preflight for the
  three a browser calls and 401s the three `pg_cron` fires. Step 7 has
  the reasoning and the two `curl`s that tell you which state you are
  in; that pairing is deliberate, since the check is worth nothing
  except immediately after a deploy.
- Deploying *before* the merge is the one deviation this process allows,
  and only when the live function is the only place the change can be
  verified. Workflow step 7 has the conditions, all four of them, and
  only step 7 has them: a second copy is a second thing to keep true,
  and this section restating the rule as absolute is how the file spent
  a release contradicting itself. Migrations get no such case.
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

Everything in this section is about the React client in `app/`. The
native client has no testing story yet -- not a lax one, an absent one
-- and the rules below do not silently extend to it: they name
TypeScript paths, a Vitest config and an `npm` script, none of which a
Swift target has. The principles underneath them (test where a wrong
answer is silent, a regression test that has never been red is a guess)
are worth carrying over; the mechanics have to be decided and written
down here, in the same session they are settled, like any other process
rule.

The React client is tested with [Vitest](https://vitest.dev) and
Testing Library, configured inside `app/vite.config.ts` so tests
resolve and transform through the same pipeline the build uses. `npm
test` in `app/` runs them; `npm run test:watch` while working. Tests
sit beside what they test, as `x.test.ts` next to `x.ts`.

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

It runs with `working-directory: app`, and that boundary is the thing to
hold on to: nothing outside `app/` is typechecked, linted or tested by
anything. `supabase/functions/` is not -- which now means the six
self-authorization checks that are the whole access control on those
functions are held in place by nothing but memory -- and neither is
`scripts/`, nor a native client when one exists. A PR entirely outside
`app/` still gets two green required checks; they just had nothing in
the diff to look at.

`.github/workflows/db-lint.yml` starts a local Supabase stack, applying
every migration from scratch, and runs five checks against the database
that produces. A migration that fails to apply cleanly fails the PR on
its own.

`supabase db lint` is plpgsql_check and nothing else: it type-checks
PL/pgSQL function bodies. It does not look at RLS, at comments, or at
anything the Supabase security and performance advisors report -- those
are a separate thing, checked by hand after a migration applies and
again at release (see "Migrations"). Believing otherwise is how a table
without RLS would sail through a green check.

`scripts/check-migration-answers.mjs` fails a migration that creates a
table or adds a column without answering the six questions. It needs no
database, so it runs first.

`scripts/check-docs.mjs` checks the claims in the docs that something in
the repo can contradict: every relative markdown link and heading anchor
resolves, ADR numbers are unique and match their own headings (and an
ADR added on a branch cannot take a number `main` already used), the
architecture diagram draws the Edge Functions that exist, migrations
follow the filename convention, every released tag has a CHANGELOG
entry, and no component queries Supabase outside `app/src/data/`. It
needs no database, so it reports on every PR --- including the ones that
only touch docs.

`scripts/check-docs-db.mjs` does the same against the schema -- the ER
diagram draws every table, the scheduled jobs are the documented ones,
the dashboard's cards name columns that exist -- but it queries the
Postgres that `db-lint.yml` builds from the migrations, so **it runs
only when the PR touches `supabase/migrations/`**. Same for `db lint`,
`check-schema-docs.mjs` and `check-rls-shape.mjs`. Read that as the
coverage it is: a docs-only PR can delete a table from the ER diagram,
rename a cron job in `docs/monitoring.md` or point a dashboard card at
a column that does not exist, and go entirely green. The two halves are
worth keeping straight when a green board is the only review a PR gets.

What those two deliberately do *not* do is require a doc to change when
code changes. That is a gate rather than a check: it is satisfied by
touching the file, and it fires on the many PRs where nothing has gone
stale. [`0035`](docs/decisions/0035-what-the-docs-are-checked-against.md)
records what else was tried and rejected, which is most of it.

`scripts/check-schema-docs.mjs` reads the freshly built database and
fails on a relation the chat describes with no `COMMENT ON`, on a
`NOT_DESCRIBED` entry naming a relation that no longer exists, and on
the count of uncommented columns per table disagreeing with
`scripts/schema-docs-baseline.json` in *either* direction. Higher than
the baseline is a column that shipped undocumented. Lower is a PR that
documented something and left the ceiling where it was, which is slack
the backlog can quietly grow back into -- so the check fails with the
corrected file printed, ready to paste. `node
scripts/check-schema-docs.mjs --update-baseline` writes it directly if
you have a local stack running. That is what makes it a ratchet rather
than a cap: the number falls and then stays down.

`scripts/check-rls-shape.mjs` reads the policies on that same database
and fails one that passes a row's own column to a tenancy helper --
`using (private.user_can_access_producer(producer_id))` -- instead of
comparing against the caller resolved once. Both are correct; the first
runs the helper per row, and on `weather_observations` at 143,588 rows
that was 1,500ms against 15ms, which is how a weather question came to
spend eight model turns working around a statement timeout
([`0036`](docs/decisions/0036-rls-predicates-are-evaluated-once.md)).
Nothing else here would catch it: `db lint` reads PL/pgSQL bodies,
Supabase's initplan advisor doesn't fire on a `SECURITY DEFINER` helper,
and the same policy on a four-row table is free -- so it looks fine until
a table grows.

The stack-dependent steps are skipped internally for a PR that touches
no migration, but the workflow itself still runs -- a required check has
to report on every PR or it blocks them forever. The checkers' own tests
(`node --test scripts/*.test.mjs`) run unconditionally, because a regex
that has quietly stopped matching looks exactly like a PR with nothing
wrong in it.

### What a green board does not mean

Several rules in this file are enforced by nothing but whoever is
reading it, and with no per-PR review that is worth naming rather than
leaving to be discovered. Not checked by anything: that
`app/src/data/schema.ts` was regenerated with the migration that made
it stale (the file is generated, so a stale copy type-checks happily
against a schema that no longer exists); that a destructive migration
renamed instead of dropping; that a new table has RLS turned on at all;
that a function deploy carried `--no-verify-jwt`; that the PR title is a
conventional commit, which
squash merge turns into `main`'s commit subject; that auto-merge was
actually requested; that a migration waited for the merge; that the
release body has the shape Releases step 4 describes. Most of those are
mechanizable and some should be mechanized. Until they are, a green
board means the mechanical half passed, and nothing more.

Two things that used to be on that list are off it, and the way they came
off is the point. **What is granted to `anon`** is now
`scripts/check-anon-reach.mjs`, which reads the resulting ACL out of the
database rather than the migration text -- because the mistake it exists
to catch was a migration that said `create or replace function` and meant
it while Postgres created something else. And **the Edge Functions** are
now typechecked, linted and tested by the `functions` job in
`web.yml`, with `scripts/check-function-guards.mjs` reading the one thing
a test cannot: that each handler still resolves its caller *before* it
does anything that costs money.

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

1. Check `README.md`, this file, [`AGENTS.md`](AGENTS.md),
   `docs/architecture.md`, `docs/data-model.md`, `docs/monitoring.md`,
   and any ADR with a placeholder or "not yet decided" left in it
   against what actually shipped in the batch -- not just the CHANGELOG
   entry. That is step 4's list exactly, and it cannot be shorter:
   with no per-PR review this is the only pass that catches what step 4
   skipped, and a backstop that reads fewer docs than the gate it backs
   up misses exactly what got through. A
   fast-moving batch of PRs reliably leaves the higher-level docs
   describing an earlier version of the project than the one about to
   be tagged; catch that here; don't let it accumulate. Check Supabase's
   security and performance advisors too, so a finding doesn't sit
   unnoticed across a release -- remembering that the anon-callable lint
   only sees `SECURITY DEFINER`, so a clean advisor report is not a
   statement about who can reach what (see "Migrations").
2. **Every bullet the Release will carry is exercised on the client a
   producer actually uses, before the tag.** A bullet is a claim that
   somebody can now do a thing; until somebody does that thing, nobody
   has checked the claim. `Frontend` and `Backend` bullets are exercised
   in the running app -- the iOS build for anything reachable there,
   since that is what the producer opens, and **the iOS build has to be
   rebuilt from the commit being released**, or what was tested is an
   older app. `Infra` bullets have nothing producer-visible to exercise
   and need none.

   That rebuild is an instruction nobody can follow without the
   commands, so here they are. What the producer opens today is the
   Capacitor shell, so from `app/`, on the commit being released:

   ```
   npm ci && npm run build
   npx cap sync ios
   xcodebuild -project ios/App/App.xcodeproj -scheme App \
     -configuration Debug -destination id=<device-udid> \
     -allowProvisioningUpdates build
   ```

   (`xcrun xctrace list devices` prints the connected phone's UDID.)

   `npx cap sync` is the step that carries the release: the iOS bundle
   holds its own copy of `dist/`, so skipping it builds the previous
   release's web assets and exercises the wrong app. Signing needs a
   development team even for the simulator -- a free personal Apple ID
   is enough, and `DEVELOPMENT_TEAM` is committed
   ([`0029`](docs/decisions/0029-ios-shell-and-native-sign-in.md)).
   Installing it does not need Xcode and does not need a cable, which
   this file claimed for longer than it was true:

   ```
   xcrun devicectl device install app --device <device-udid> \
     ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app
   ```

   The phone is reachable over Wi-Fi once it has been paired --
   `xcrun devicectl list devices --json-output -` reports
   `transportType: localNetwork` and `tunnelState: connected` when it
   is, which is what to check first when an install cannot find it.
   There is still no App Store listing and no TestFlight, because a free
   personal team has neither; what a cable is actually required for is
   the first pairing, not each install.

   The free team is also why the installed app stops launching after
   seven days: its provisioning profile is issued for exactly that long
   (`security cms -D -i <App.app>/embedded.mobileprovision` prints the
   dates). Rebuilding and reinstalling is the whole fix, and it is the
   recurring cost of not paying for a developer account rather than
   anything being wrong.

   **Who does which half.** Whoever has the Mac produces the build; the
   producer exercises it, because an agent has neither the phone nor
   the vineyard. So an agent's part of step 2 is to build from the
   commit being tagged, confirm the bundle actually carries this
   batch's code, and hand the producer a numbered list -- one row per
   bullet, what to do and what should happen -- for them to work down.

   **That exchange happens in the working session, not in the release
   PR.** It is a conversation between two people over a few minutes,
   and GitHub is a bad place to hold one: the checklist and the replies
   are not review of the diff, nobody comes back to a merged PR's
   comments to read them, and posting them there turns the PR into a
   chat window that also has to be moderated. `0.15.0` (#240) was done
   the other way and is still the worked example for the *outcome* --
   two bullets came out of that release because nobody could exercise
   them -- but not for where the list was written.

   All of that describes the shell. When the SwiftUI client
   ([`0038`](docs/decisions/0038-the-phone-gets-its-own-client.md)) is
   what the producer opens, the commands change and this step changes
   with them in the same PR; the rule above them does not change at
   all.

   Say back what was observed rather than that it was tested -- not
   "streaming works" but "sent a question from the phone, the status
   line said it was reading vineyard data, the answer arrived a word at
   a time." That distinction is the whole value of the step, and it is
   worth just as much said out loud as written down; the point is to
   have looked, not to have a record of having looked. **None of it is
   logged** -- not in the PR, not in `CHANGELOG.md`, not anywhere. A
   bullet that cannot be exercised does not ship in that release -- it
   waits for the one where it can.

   This is here because skipping it nearly shipped a lie. `0.15.0` was
   drafted with "replies now arrive as they're written" while the iOS
   shell could not read a streamed reply at all: the function answered
   `200`, ran the model, and logged a complete turn, and the producer
   saw `Load failed`. **Server logs are not evidence that a producer got
   an answer.** The only evidence is someone using the app.

3. A version section is added to [`CHANGELOG.md`](CHANGELOG.md): prose
   that leads with the theme -- why this batch of changes happened --
   and keeps that why running through every paragraph, not just the
   opening line. A paragraph that only lists what changed, without
   saying why it mattered or why that choice was made, needs another
   pass. Not a categorized bullet list. **This is the engineering
   record** -- it documents *why*, references PR numbers and ADRs by
   name, and is never shown inside the app.
4. A matching git tag and GitHub Release are published. **The Release's
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
