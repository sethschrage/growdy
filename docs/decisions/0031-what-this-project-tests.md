# 0031. What this project tests, and what it doesn't

**Status:** accepted

## Context

Seven days in, the project has `0.13.0` behind it, 69 migrations and
6,864 lines of client code -- and no tests of any kind, with no CI
touching the client at all. `db-lint` ran on every PR and checked the
schema, so a PR that changed only `app/` was auto-merged, unreviewed,
on the strength of a green check that had not read a line of it. `tsc`
and `oxlint` existed as local commands and nothing enforced either.

That was a defensible trade while the app was a research tool being
reshaped daily (`0008`), and it stopped being defensible for a
specific, observable reason: the chat's scroll area needed fixing in
four separate PRs in that same week (`#180`, `#181`, `#187`, `#189`).
Several of those fixes were reasoned from the layout rather than
measured, and were wrong until measurement replaced the reasoning. Each
was verified by hand once and never again, so nothing but memory stood
between one fix and the next undoing it -- and the fourth found that
the third's pinning only knew where the view was, not whether a finger
was on it.

The next thing being built is a GIS map, which multiplies the amount of
code where a wrong answer looks plausible on screen: coordinate
handling, unit conversion, geometry that renders fine and means
something else. Hand-verification does not survive that, and this is
the last moment where adding tests is cheap.

## Decision

**Vitest and Testing Library**, configured inside `app/vite.config.ts`
rather than a config of their own, so tests resolve modules and
transform JSX through exactly the same pipeline as the build. Jest was
the alternative and would have meant a second, parallel module
resolution to keep in step with Vite's -- a class of failure where the
test and the app disagree about what a module even is.

**The rules are written as obligations on specific kinds of code**, not
as a coverage number (`CONTRIBUTING.md`, "Tests"):

- Every exported function in `app/src/data/` and `app/src/lib/` has
  unit tests.
- Every bug fix ships a test that fails without the fix, written first
  and watched failing.
- Components get behaviour tests where behaviour branches -- empty,
  error, gated -- not markup tests.
- No snapshot tests.
- Touching an untested file brings it under test in that PR.

**No coverage threshold.** This is the live alternative and it was
rejected deliberately. A threshold is objective and unarguable, which
is its appeal, but it measures lines executed rather than risk covered:
the cheapest way to satisfy it is to test what is easy to reach, and
the honest way -- testing the EXIF byte walker, the SVG sanitiser, the
query layer -- is the expensive way. A number would also have to be met
on day one, which means a backfill of tests written against code nobody
was touching, by someone who had to reconstruct what it was supposed to
do. The rules above name the risky code outright instead.

**Test-on-touch instead of a backfill milestone.** Coverage arrives
where work already is. A file nobody has needed to open in months is
not where the next bug is, and a milestone would have put the tests
exactly there.

**CI runs typecheck, lint and tests on every PR** as a required check
(`.github/workflows/web.yml`). Not path-filtered, for the reason
`db-lint.yml` documents: a required check that doesn't report on a PR
blocks it forever.

## Consequences

- **Every PR touching the client is now slower.** That is the point,
  and it is a real cost -- auto-merge with no per-PR review
  (`CONTRIBUTING.md`, "Workflow") means CI is the only thing standing
  between a mistake and `main`, so the check has to be worth waiting
  for.
- **The first tests are not spread evenly**, and shouldn't be read as a
  measure of what matters. They cover `lib/exif.ts` (a byte-level
  reader, verified once by hand against a synthetic JPEG and never
  again), `sanitizeSvg.ts` (the one function between model-generated
  markup and script execution in a signed-out visitor's browser, see
  `0021`, `0027`) and `ObservationPhoto` (three states around a signing
  call that can fail). `sanitizeSvg.ts` is gone as of 2026-09-21,
  deleted with the artifacts feature it existed to protect (`0021` and
  `0027` are both withdrawn), and its tests went with it. The rule that
  put it under test -- every exported function in `lib/` -- is
  unchanged; what it covers moves as the code does.
- **"Bug fix ships a failing test first" does not fit every bug.** A
  layout defect measured in the browser -- the scroll bugs that
  prompted this -- has no unit test that would have caught it, and
  pretending otherwise would produce tests that assert CSS back at
  itself. The rule says "whenever the bug is reachable from a test" on
  purpose, and the honest answer for those is a measurement recorded in
  the PR.
- **The data layer this assumes does not exist yet.** The rule names
  `app/src/data/` before there is one; it is the next PR, and the rule
  is written now so the layer arrives with tests rather than acquiring
  them later.
- **oxlint's existing warnings stay warnings.** CI fails on lint errors,
  and the four `set-state-in-effect` warnings on `main` today are not
  errors. Turning them into failures is a separate decision about those
  four call sites, not something to smuggle in with the harness.

## Update (2026-09-21): the Edge Functions have a runner now

This ADR argued entirely from `app/src`, because that was the only
TypeScript anybody was proposing to test. `supabase/functions/` -- 2,248
lines -- went unmentioned, and so went unchecked: `web.yml` runs with
`working-directory: app`, `db-lint.yml` covers the database, and nothing
ran Deno at all.

That became the wrong silence on 2026-09-21. `#238` added a
`resolveProducerId` guard to the three browser-facing functions, because
all three were reaching Anthropic and Tempest for callers with no
credentials. `verify_jwt` is deliberately `false` on all six so each can
answer its own CORS preflight, which means the gateway checks nothing and
those few lines are the entire access control. A typo in them would have
shipped green.

So the rules here apply to `supabase/functions/` too, with one addition
that the `app/src` half does not need.

**The guard is tested where it is testable.** `resolveProducerId` and
`unauthorizedResponse` are pure enough to test against a stubbed client,
and are, in
[`supabase/functions/_shared/supabaseClient.test.ts`](../../supabase/functions/_shared/supabaseClient.test.ts):
a permission error, an empty result, a null `producer_id` and a good row,
plus that the refusal is a 401 carrying CORS headers under the key the
clients already unpack. Deno's own runner, no new dependency.

**And the part that is not reachable from a test is checked by a script
instead.** The regression that matters is not the guard being absent --
a test catches that. It is the guard being present, correct, and moved
below the first thing that spends money, which is what `#238` actually
was. No unit test sees an ordering.
[`scripts/check-function-guards.mjs`](../../scripts/check-function-guards.mjs)
reads it: that each browser-facing handler answers `OPTIONS` first, then
resolves a producer, then works; that the cron three send a trigger token
and never try to resolve a producer they do not have; and that a function
in neither list fails rather than passing silently.

That is the same move this ADR already makes for layout defects -- when
the honest answer is "no unit test would have caught this", write down
what would have, rather than writing a test that asserts the code back at
itself. A checker is that written down and made to run.

## Update (2026-09-22): the native client

Everything above is the web client's. The native client is tested with
Swift Testing in its own package, by rules adapted from these, and the
mechanics are in `CONTRIBUTING.md` under "Tests"; the decision and its
reasons are [`0039`](0039-how-the-native-client-is-built-tested-and-delivered.md).
The map this ADR anticipated arrives in the native client, and its
coordinate and geometry code lives in that tested package, not in a view.
