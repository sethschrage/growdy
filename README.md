# Growdy

A database for capturing information about plants in a parcel of land over
time -- what's planted, where, when, and what's observed about it.

Most interaction still happens directly against the database, but a
real app now exists alongside it (see `app/`): producers sign in with
Google and can submit field observations through an AI-guided chat
instead of a form. It's still a research tool, not a finished product
-- built to find out what field use and other producers actually need
before building more of either the schema or the app. See
[`docs/decisions/0008`](docs/decisions/0008-app-as-research-tool.md) and
[`docs/decisions/0009`](docs/decisions/0009-chat-based-observation-submission.md).

## Status

Early. The core hierarchy (producer/parcel/plot/row/planting) is in
place, and a companion app now exists for submitting field
observations through Google-authenticated, AI-guided chat rather than
direct SQL. See open and merged PRs for current progress, and
[`docs/decisions/`](docs/decisions) for the reasoning behind each
structural and app choice.

## Data model

See [`docs/data-model.md`](docs/data-model.md) for a diagram of every
table and how they relate.

## Notable design decisions

- [0001 -- Tenancy membership model](docs/decisions/0001-tenancy-membership-model.md) -- how a user resolves to a producer, isolated behind one swappable RLS helper function.
- [0002 -- Planting location model](docs/decisions/0002-planting-location-model.md) -- a planting is either organized (plot/row/position) or unplotted (a PostGIS location), never both, never neither.
- [0004 -- Plant types kind and planting columns](docs/decisions/0004-plant-types-kind-and-planting-columns.md) -- a shared, global vocabulary of variety/scion/rootstock names, and how `planting` references it depending on whether a plant is own-rooted or grafted. Supersedes [0003](docs/decisions/0003-plant-types-reference-table.md).
- [0005 -- Observations table](docs/decisions/0005-observations-table.md) -- append-only, dated notes linked to a planting; free text now, structured fields only once a pattern proves worth promoting.
- [0006 -- Planting lifecycle and position status](docs/decisions/0006-planting-lifecycle-and-position-status.md) -- why dead and removed are different events, and why per-position status is a database view rather than external code.
- [0007 -- Uncertain values stay null](docs/decisions/0007-uncertain-values-stay-null.md) -- a hedged/unconfirmed identity fact stays null in its structured column; the guess lives in `nickname` or an observation instead, never asserted as fact.
- [0008 -- App as a research tool](docs/decisions/0008-app-as-research-tool.md) -- the app exists to validate what field use and other producers actually need, not to be a finished product; it gets built up the same evidence-driven way the schema has been.
- [0009 -- Chat-based observation submission](docs/decisions/0009-chat-based-observation-submission.md) -- submission is an open-ended chat, not a form, so real field language can surface schema gaps a form would hide; every submission is reviewed before it counts as confirmed data.

## Stack

| Concern | Choice |
|---|---|
| Database | [Supabase](https://supabase.com) (Postgres, Free tier) |
| Spatial | PostGIS |
| File storage | Supabase Storage |
| Schema history | Supabase CLI migrations, in `supabase/migrations/` |
| Client | React (Vite), in `app/` -- see [`docs/decisions/0008`](docs/decisions/0008-app-as-research-tool.md) |
| Auth | Google Sign-In via Supabase Auth -- Testing status, explicit test-user allow-list |
| Server-side logic | Supabase Edge Functions, in `supabase/functions/` -- the only place a secret (like an API key) ever lives |
| AI | Anthropic Claude (Haiku) -- see [`docs/decisions/0009`](docs/decisions/0009-chat-based-observation-submission.md) |

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch/PR/CI workflow this
repo follows.

## License

This code is shared publicly for portfolio purposes. All rights reserved
-- no license is granted for reuse.
