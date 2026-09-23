# Working in this repo

[`CONTRIBUTING.md`](CONTRIBUTING.md) is the process, and it is not
optional or advisory. Read it before the first change of a session, not
after something goes wrong. This file is a pointer with the few things
that get skipped most often, never a replacement.

The name is deliberately tool-neutral: any coding agent working here
should read this, not just one vendor's. `CLAUDE.md` sits alongside it
and does nothing but point here, because Claude Code auto-loads that
filename specifically -- if another tool wants its own entry point, add
a pointer the same way rather than a second copy of the rules.

## Two clients, one backend

Before any of the process below means anything: growdy is being rebuilt
around a native client, and which client you are working in decides
which of these rules reach you.

- **The iOS app is being rebuilt as a native SwiftUI client, and it is
  the full-featured one. New feature work goes there.** Its code does
  not exist yet -- what is on the producer's phone today is the
  Capacitor shell in `app/ios/`, wrapping the same React build. Where it
  lives (`native/`, an app target over a local `GrowdyKit` package), how
  it is tested (Swift Testing, on the Mac, no simulator) and how it
  reaches the phone (built here, installed over Wi-Fi, re-signed weekly
  on a free Apple team) are decided in
  [`0039`](docs/decisions/0039-how-the-native-client-is-built-tested-and-delivered.md).
  Read it before touching native code: it also lists every place the
  native client deliberately does *not* behave like the web one, so
  that nobody "fixes" it back.
- **The React app in `app/` is frozen as a desktop surface.** It stays
  deployed and working -- reviewing vineyard data, history, the
  producer tree on a real screen -- and takes no new features. Keeping
  it running is in scope; growing it is not. Two narrow exceptions,
  recorded in `0038`'s update: it changes where shared data would
  otherwise go wrong (conversation saving), and for review features
  that fit that desktop job.
- **Everything that is not a user interface is shared and stays where
  it is**: the Postgres schema and its RLS, the six Edge Functions, the
  auth model, the prompts. That is most of the system, and a change
  there is a change to both clients at once. The one planned exception
  is conversation saving, which moves into a database function both
  clients call; it gets its own ADR before it is built.

[`0038`](docs/decisions/0038-the-phone-gets-its-own-client.md) is the
decision and the measurements behind it; read it before proposing
anything that assumes a single client. It also named a debt: the API
contract between the clients and the backend had never been written
down, because with one client the client *was* the specification. It
is now [`docs/api-contract.md`](docs/api-contract.md). Where it speaks,
trust it over `app/src`. Where it defers -- it points at
`app/src/data/` for PostgREST column lists and filters -- read those
modules, then write what you relied on back into the contract in the
same PR. Where code and contract disagree, the code is what
runs and the contract is the bug; fix it in that PR.

## The one that keeps getting missed

**Update the base docs in the same PR as the change.** Before opening
any PR, ask of each:

- `README.md` -- does the Stack table still describe what actually runs?
- `docs/architecture.md` -- does the diagram still show what talks to
  what? If not, move the old diagram into `## History` with a date and a
  reason *before* editing the live one. That applies to a diagram that
  has stopped being true, not to one that was drawn wrong: correcting an
  omission is a fix, and copying 180 lines into `## History` to record
  that a box was missing buries the epochs that entry exists to mark.
- `docs/data-model.md` -- does it still match the schema?
- [`docs/api-contract.md`](docs/api-contract.md) -- did this change
  anything a second client depends on? A request or response shape, an
  SSE event, an RPC signature, a storage policy, an error key. This one
  drifts differently from the others: the React client and the contract
  can disagree for weeks without anything failing, because the React
  client is not checked against it -- it is checked against itself. The
  native client is what finds out.
- `docs/monitoring.md` -- did this add something that can fail quietly?
- `docs/decisions/` -- does this contradict or amend an existing ADR?
- `AGENTS.md` (this file) and [`CONTRIBUTING.md`](CONTRIBUTING.md) --
  did this change a rule, or change the thing a rule describes? These
  two *are* the process, and nothing mechanical checks prose: a rule
  that has quietly stopped being true reads exactly like one that
  works. They were on no staleness list at all until 2026-09-21, and it
  showed: the `--no-verify-jwt` hazard below lived only in
  `docs/monitoring.md` and a commit message, and this file managed not
  to mention that the project has a client.

For most PRs every answer is no, and that takes a few seconds. The PRs
where the answer is yes are exactly the ones nobody will remember a
month later. A change to what the project *is* -- a new client, a new
deploy path, a new external dependency -- has almost certainly made at
least one of these wrong.

Part of this is checked in CI
([`0035`](docs/decisions/0035-what-the-docs-are-checked-against.md)) --
but only part of it runs on every PR, and the difference is worth
knowing before you trust a green board. `scripts/check-docs.mjs` needs
no database and reports on everything: dead links and anchors, ADR
numbering and collisions, the Edge Functions the architecture diagram
draws, the migration filename convention, a CHANGELOG entry per
released tag. The rest -- the tables the ER diagram draws, the
scheduled jobs the docs name, the dashboard's columns -- is
`scripts/check-docs-db.mjs`, which queries a Postgres built from the
migrations and therefore runs **only when the PR touches
`supabase/migrations/`**. A docs-only PR can delete a table from the ER
diagram or rename a cron job and go fully green.

That covers pointers, counts and names -- the mechanical half. Whether
a paragraph is still *true* is still on you, and it is the half that
matters.

This matters more here than in most repos because auto-merge is on and
there is no per-PR review. Nobody is going to catch it after you.

## Also easy to get wrong

- **ADR numbers collide.** They're sequential, and a branch cut before
  another one merged will claim a number that's already taken. Re-check
  `docs/decisions/` immediately before opening the PR, and re-read the
  decision itself against current `main` -- a stale ADR can end up
  describing a road not taken that the repo has since taken.
- **ADRs are for live alternatives, not for hard problems.** A bug with
  one right answer gets a code comment, however long it took to find.
- **Release notes only describe what shipped and is reachable.** Nothing
  merged-but-unlaunched, nothing about an outage or an external
  dependency. Those bullets render in the app's own "What's new". And
  *reachable* means somebody reached it: every bullet is exercised in
  the running app, on the client the producer uses, before the tag --
  `CONTRIBUTING.md`, Releases step 2. A green CI run and a clean server
  log are not evidence that a producer got an answer.
- **Process decisions get committed, not agreed in chat.** If a rule
  isn't in git, it isn't a rule.
- **"Add a column" is a question, not an instruction.** Before writing
  any migration that creates a table or view or adds a column, put the
  six questions in
  [`docs/schema-change-questions.md`](docs/schema-change-questions.md)
  to whoever asked, and write their answers into the migration's header.
  Purpose, what each column means, what it relates to, who can see it,
  whether the chat is told about it, what happens to existing rows --
  none of it is inferable from the request, and a plausible guess is
  worse than a question, because it ships. You will not get far without
  asking: in Claude Code a `PreToolUse` hook refuses the write outright
  -- it is configured in `.claude/settings.json`, so another tool will
  not fire it -- and CI fails the PR either way. Neither can tell
  whether the answers came from the person or from you, which is
  exactly why the asking is the point.
- **Migrations wait for the merge. Edge Functions sometimes can't.**
  Applying a migration before review is a schema change nobody agreed
  to. Deploying a *function* early is allowed only when the live
  function is the only place the change can be verified -- caching,
  streaming, or a production failure -- and then the PR goes up the
  same session saying so. `CONTRIBUTING.md` step 7 has the conditions.
  **Every deploy carries `--no-verify-jwt`** (or `verify_jwt: false`
  through the Supabase MCP server, whose default is `true`). All six
  functions run with the gateway check off and authorize themselves;
  deploying without the flag turns it back on, which 401s the CORS
  preflight and every `pg_cron` caller, and nothing in CI or the
  advisors can see it. Step 7 has the command and the two `curl` checks
  that say which state you are actually in.
- **Tests are not optional work.** A bug fix ships a test that fails
  without it; a new function in `app/src/data/` or `app/src/lib/` ships
  unit tests; touching an untested file brings it under test in the
  same PR. `npm test` in `app/`, and CI runs it on every PR. Those
  rules and that command are the React client's; the native client's
  are Swift Testing in `native/GrowdyKit` (`0039`), and they land with
  its first code. The full rules for both, including what deliberately
  isn't tested, are in `CONTRIBUTING.md` under "Tests".

## Verify, don't assume

Claims about what the app does get checked against the source of the
client you are making the claim about -- `app/src/` for the React app,
the native client's own source once there is one -- not against an ADR
or a PR title, which describe intent, and intent and shipped code have
diverged here before. Reading React to establish what the native client
does is that same mistake wearing a new hat: after
[`0038`](docs/decisions/0038-the-phone-gets-its-own-client.md) they are
two implementations, and only the API underneath them is shared. The
same goes for anything you're about to write in a doc: if you can run
it, run it.
