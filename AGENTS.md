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
- `docs/monitoring.md` -- did this add something that can fail quietly?
- `docs/decisions/` -- does this contradict or amend an existing ADR?

For most PRs every answer is no, and that takes a few seconds. The PRs
where the answer is yes are exactly the ones nobody will remember a
month later. A change to what the project *is* -- a new client, a new
deploy path, a new external dependency -- has almost certainly made at
least one of these wrong.

Part of this is now checked on every PR
([`0035`](docs/decisions/0035-what-the-docs-are-checked-against.md)):
dead links and anchors, ADR numbering and collisions, the Edge Functions
and tables the diagrams draw, the scheduled jobs the docs name, the
dashboard's columns. That covers pointers, counts and names -- the
mechanical half. Whether a paragraph is still *true* is still on you,
and it is the half that matters.

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
  dependency. Those bullets render in the app's own "What's new".
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
  asking: a hook refuses the write outright, and CI fails the PR after
  it. Neither can tell whether the answers came from the person or from
  you, which is exactly why the asking is the point.
- **Migrations wait for the merge. Edge Functions sometimes can't.**
  Applying a migration before review is a schema change nobody agreed
  to. Deploying a *function* early is allowed only when the live
  function is the only place the change can be verified -- caching,
  streaming, or a production failure -- and then the PR goes up the
  same session saying so. `CONTRIBUTING.md` step 7 has the conditions.
- **Tests are not optional work.** A bug fix ships a test that fails
  without it; a new function in `app/src/data/` or `app/src/lib/` ships
  unit tests; touching an untested file brings it under test in the
  same PR. `npm test` in `app/`, and CI runs it on every PR. The full
  rules, including what deliberately isn't tested, are in
  `CONTRIBUTING.md` under "Tests".

## Verify, don't assume

Claims about what the app does get checked against `app/src/`, not
against an ADR or a PR title -- those describe intent, and intent and
shipped code have diverged here before. The same goes for anything
you're about to write in a doc: if you can run it, run it.
