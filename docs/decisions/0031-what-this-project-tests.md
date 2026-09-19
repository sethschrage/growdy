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
  call that can fail).
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
