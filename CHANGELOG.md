# Changelog

All notable changes to this project are documented here, one entry per
release. Each entry opens with the theme -- why that batch of changes
happened -- then describes what changed in prose, not a categorized
list. Versioning follows [Semantic Versioning](https://semver.org/).

Releases are cut in batches, once a group of merged PRs adds up to a real
milestone -- not one release per PR. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the full process.

## [Unreleased]

## [0.3.0] - 2026-09-13

This milestone is the app's real beginning: producers can now sign in
and submit field observations through an AI-guided conversation
instead of a form -- and building it immediately proved the point of
building it at all, surfacing a permissions gap that had been sitting
invisible in the schema since the very first migration.

The app (`app/`) exists now, and it's real, not a placeholder: an
authenticated client using Google Sign-In, restricted to explicit test
users while the underlying Google Cloud app stays in Testing status
(docs/decisions/0008, #23, #24, #25). Once signed in, a producer can
describe an observation to a chat interface in their own words --
"the plant near the busted trellis has fungus" -- and a Supabase Edge
Function holding the Claude API key gathers whatever's missing through
conversation, resolves the description against `planting_readable`,
and shows a plain confirmation before inserting anything at all
(docs/decisions/0009, #26, #27, #29, #30). Nothing becomes confirmed
data without a separate human review step afterward, enforced by the
database itself rather than app convention -- a submission can only
ever land as `pending`.

The first real end-to-end test of that flow surfaced something bigger
than a bug: every table in the schema, plus the two derived views,
had row-level security policies that were entirely correct but never
actually reachable by a real signed-in user. A base `grant` Postgres
checks before row-level security is even evaluated had been missing
since day one, invisible because every prior check in this project ran
through an elevated connection that bypasses it (#32, #33). Fixed now
-- exactly the kind of gap the app exists to surface.

## [0.2.0] - 2026-09-13

This milestone exists because of a test import -- running real vineyard
data through the schema surfaced exactly what it was still missing, and
this batch of changes is a direct response to that.

Grafted plants needed two separate identities, not one free-text
`species` field, so `plant_types` (#9, #11, #12; supersedes
`docs/decisions/0003`, see `0004`) became a shared vocabulary of
varieties, scions, and rootstocks that `planting` now references
directly. Field notes needed a home, so `observations` (#13; `0005`)
gives every planting an append-only, dated note. A plant dying and a
plant being physically removed turned out to be two different moments,
not one, so `planting` gained `dead_date` and `removed_reason` (#14;
`0006`), and a `position_status` view derives planted/blocked/open per
position from that instead of storing it redundantly (#16). `plot_rows`
picked up `length_meters` and `spacing_meters` for real row geometry
(#15), and `planting_readable` (#18) resolves every foreign key to its
name for browsing without manual joins -- the full shape of it all is now
diagrammed in `docs/data-model.md` (#17).

The import also forced a hard rule: an uncertain identity -- an
unconfirmed scion, a hedged rootstock -- stays null rather than becoming
a stored guess (#19; `0007`). A routine performance pass separately fixed
an `auth_rls_initplan` warning on the `profiles` RLS policies (#20).

## [0.1.0] - 2026-09-12

The full tenancy + land hierarchy: `producer` -> `parcel` -> `plot` ->
`plot_row` -> `planting`. See `docs/decisions/0001` and `docs/decisions/0002`
for the reasoning behind the tenancy model and the organized/unplotted
planting design.

### Added

- Tenancy foundation: `producers` (permission boundary) and `profiles`,
  with every RLS policy scoped through a single reusable helper function,
  `private.user_can_access_producer()` (#1)
- `parcels` -- the top-level land unit a producer owns/leases (#3)
- `plots` -- named subdivisions within a parcel, organizing plantings into
  rows (#4)
- `plot_rows` -- numbered rows within a plot (#6)
- `planting` -- one plant's occupancy of a place: organized
  (plot/row/position) or unplotted (a PostGIS location, for weeds,
  invasives, and wild finds), never edited in place (#7)
- PostGIS, enabled once an actual need existed rather than speculatively
  ahead of one
- CI: a `db-lint` GitHub Action validating every migration against a fresh
  local Supabase stack on every pull request
- Repository process: branch protection requiring PRs on `main`,
  squash-only merges, `CONTRIBUTING.md`, and an ADR practice
  (`docs/decisions/`) for decisions worth preserving the reasoning behind
  (#2, #5)

### Fixed

- `db-lint` scoped to this project's own schemas (`public`, `private`),
  excluding PostGIS's bundled legacy functions from lint checks (#7)
