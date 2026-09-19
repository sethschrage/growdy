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
  reason *before* editing the live one.
- `docs/data-model.md` -- does it still match the schema?
- `docs/monitoring.md` -- did this add something that can fail quietly?
- `docs/decisions/` -- does this contradict or amend an existing ADR?

For most PRs every answer is no, and that takes a few seconds. The PRs
where the answer is yes are exactly the ones nobody will remember a
month later. A change to what the project *is* -- a new client, a new
deploy path, a new external dependency -- has almost certainly made at
least one of these wrong.

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
