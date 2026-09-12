# Growdy

A database for capturing information about plants in a parcel of land over
time -- what's planted, where, when, and what's observed about it.

There's no front-end. Interaction happens directly against the database.

## Status

Early. The core hierarchy (producer/parcel/plot/row/planting) is being
built out piece by piece; see open and merged PRs for current progress,
and [`docs/decisions/`](docs/decisions) for the reasoning behind each
structural choice.

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
