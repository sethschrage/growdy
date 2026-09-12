# Growdy

A database for capturing information about plants in a parcel of land over
time -- what's planted, where, when, and what's observed about it.

There's no front-end. Interaction happens directly against the database.

## Status

Early. The core hierarchy (producer/parcel/plot/row/planting) is being
built out piece by piece; see open and merged PRs for current progress,
and [`docs/decisions/`](docs/decisions) for the reasoning behind each
structural choice.

## Notable design decisions

- [0001 -- Tenancy membership model](docs/decisions/0001-tenancy-membership-model.md) -- how a user resolves to a producer, isolated behind one swappable RLS helper function.
- [0002 -- Planting location model](docs/decisions/0002-planting-location-model.md) -- a planting is either organized (plot/row/position) or unplotted (a PostGIS location), never both, never neither.
- [0003 -- Plant type reference table](docs/decisions/0003-plant-types-reference-table.md) -- a shared, global vocabulary of plant/cultivar names where producers can propose new *entries* but never new schema *fields*. **Designed, not yet implemented** -- deferred until an actual data import.

## Stack

| Concern | Choice |
|---|---|
| Database | [Supabase](https://supabase.com) (Postgres, Free tier) |
| Spatial | PostGIS |
| File storage | Supabase Storage |
| Schema history | Supabase CLI migrations, in `supabase/migrations/` |

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch/PR/CI workflow this
repo follows.

## License

This code is shared publicly for portfolio purposes. All rights reserved
-- no license is granted for reuse.
