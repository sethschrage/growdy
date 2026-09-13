# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning
follows [Semantic Versioning](https://semver.org/).

Releases are cut in batches, once a group of merged PRs adds up to a real
milestone -- not one release per PR. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the full process.

## [Unreleased]

## [0.2.0] - 2026-09-13

Plant identity, observations, lifecycle tracking, and two derived views on
top of the v0.1.0 hierarchy.

### Added

- `plant_types` -- a shared, global vocabulary of variety/scion/rootstock
  names; `planting.species` (free text) replaced with `variety_id`,
  `scion_variety_id`, and `rootstock_variety_id` FKs, supporting both
  own-rooted and grafted plants (#9, #11, #12 -- `docs/decisions/0004`,
  supersedes `0003`)
- `observations` -- append-only, dated notes linked to a planting, with an
  optional `photo_metadata` field (#13 -- `docs/decisions/0005`)
- `planting.dead_date` and `removed_reason` -- a plant dying and a plant
  being physically removed are now distinct events (#14 --
  `docs/decisions/0006`)
- `plot_rows.length_meters` and `spacing_meters` -- physical row layout
  (#15)
- `position_status` view -- per-position planted/blocked/open status,
  computed rather than stored (#16 -- `docs/decisions/0006`)
- `planting_readable` view -- every FK on `planting` resolved to its name,
  plus a computed plot-row-position label, for browsing without manual
  joins (#18)
- `docs/data-model.md` -- a full Mermaid ER diagram of the schema (#17)

### Changed

- An uncertain or hedged plant identity fact (e.g. an unconfirmed scion or
  rootstock) is now stored as null in its FK column, never a best guess --
  the guess itself lives in `nickname` or an observation instead (#19 --
  `docs/decisions/0007`)

### Fixed

- `auth_rls_initplan` performance warning on the two `profiles` RLS
  policies -- `auth.uid()` wrapped as `(select auth.uid())` so Postgres
  evaluates it once per query instead of once per row (#20)

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
