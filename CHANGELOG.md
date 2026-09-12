# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning
follows [Semantic Versioning](https://semver.org/).

Releases are cut in batches, once a group of merged PRs adds up to a real
milestone -- not one release per PR. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the full process.

## [Unreleased]

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
