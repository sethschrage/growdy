# Growdy

A database for capturing information about plants in a parcel of land over
time -- what's planted, where, when, and what's observed about it.

Most interaction still happens directly against the database, but a
real app now exists alongside it (see `app/`): producers sign in with
Google and ask an AI-guided chat about their vineyard data in plain
language -- the chat writes and runs its own read-only SQL to answer,
rather than picking from a fixed menu of question types. It's still a
research tool, not a finished product -- built to find out what field
use and other producers actually need before building more of either
the schema or the app. See
[`docs/decisions/0008`](docs/decisions/0008-app-as-research-tool.md)
and [`docs/decisions/0016`](docs/decisions/0016-chat-queries-directly.md).

## Status

Early. The core hierarchy (producer/parcel/plot/row/planting) is in
place, and a companion app now exists with a Google-authenticated,
AI-guided chat for asking questions about the data, plus a browsable
history of every past conversation. The chat can also pull in outside
context -- weather, device location, grapevine phenology -- through a
Knowledge Categories screen where a producer manages what's connected
(see [`docs/decisions/0019`](docs/decisions/0019-external-data-channels.md)).
A separate, non-chat part of the app handles the producer's own
day-to-day data directly: a structured form for logging an observation,
and a read-only browser over their own parcels/plots/rows/plantings. See
open and merged PRs for current progress, and
[`docs/decisions/`](docs/decisions) for the reasoning behind each
structural and app choice.

## Data model

See [`docs/data-model.md`](docs/data-model.md) for a diagram of every
table and how they relate.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for a diagram of where
each piece runs and how they talk to each other -- the app, Vercel,
Supabase, and Anthropic.

## Notable design decisions

- [0001 -- Tenancy membership model](docs/decisions/0001-tenancy-membership-model.md) -- how a user resolves to a producer, isolated behind one swappable RLS helper function.
- [0002 -- Planting location model](docs/decisions/0002-planting-location-model.md) -- a planting is either organized (plot/row/position) or unplotted (a PostGIS location), never both, never neither.
- [0004 -- Plant types kind and planting columns](docs/decisions/0004-plant-types-kind-and-planting-columns.md) -- a shared, global vocabulary of variety/scion/rootstock names, and how `planting` references it depending on whether a plant is own-rooted or grafted. Supersedes [0003](docs/decisions/0003-plant-types-reference-table.md).
- [0005 -- Observations table](docs/decisions/0005-observations-table.md) -- append-only, dated notes linked to a planting; free text now, structured fields only once a pattern proves worth promoting.
- [0006 -- Planting lifecycle and position status](docs/decisions/0006-planting-lifecycle-and-position-status.md) -- why dead and removed are different events, and why per-position status is a database view rather than external code.
- [0007 -- Uncertain values stay null](docs/decisions/0007-uncertain-values-stay-null.md) -- a hedged/unconfirmed identity fact stays null in its structured column; the guess lives in `nickname` or an observation instead, never asserted as fact.
- [0008 -- App as a research tool](docs/decisions/0008-app-as-research-tool.md) -- the app exists to validate what field use and other producers actually need, not to be a finished product; it gets built up the same evidence-driven way the schema has been.
- [0011 -- Conversation history is a new table, written by the client](docs/decisions/0011-conversation-history.md) -- browsing past chats needs a session-level record neither existing table provides; the client writes it after every message, not an Edge Function.
- [0013 -- The model composes the answer, not a client template](docs/decisions/0013-model-composed-query-answers.md) -- the client still resolves every question the same safe, fixed way, but now sends the result back to the model to write the actual answer, so it reflects how the question was asked instead of a one-size-fits-all template.
- [0014 -- An observation can stand on its own](docs/decisions/0014-open-ended-observations.md) -- `observations.planting_id` is optional, so a general note not about one specific plant has somewhere to go. The chat-submission workflow this was originally built for is gone (see 0016), but the schema fact stands: real pre-chat field notes already rely on it.
- [0016 -- The chat writes and runs its own SQL](docs/decisions/0016-chat-queries-directly.md) -- one read-only SQL tool instead of a fixed menu of query types a hand-written resolver executes, enforced by Postgres' own read-only transaction mode rather than trusting the model; chat-based observation submission is removed entirely, though the `observations` table and its real data are untouched. Supersedes [0009](docs/decisions/0009-chat-based-observation-submission.md), [0010](docs/decisions/0010-read-only-qa-chat.md), [0012](docs/decisions/0012-unified-chat-agent.md), and [0015](docs/decisions/0015-lookup-counts-computed-in-sql.md).
- [0017 -- One status check forces a stale tab to refresh](docs/decisions/0017-app-status-forces-refresh.md) -- a build-time version stamp plus a manually-toggleable maintenance flag, polled by every open tab, hard-block the app (no dismiss) when either says something's changed that the tab doesn't know about yet.
- [0018 -- plant_types.common_name, so a clone code resolves to its variety](docs/decisions/0018-plant-types-common-name.md) -- a scion row's `name` is often a formal certified clone identifier, not the variety a producer would ask about; `common_name` closes that gap, distinct from `planting.nickname`.
- [0019 -- External data channels: Category -> Provider -> Source](docs/decisions/0019-external-data-channels.md) -- how outside data (starting with Tempest weather) gets into Growdy: producer-added sources against admin-curated providers, credentials in Supabase Vault, ingestion through the producer's own session rather than a background service, fully structured columns instead of a raw catch-all.
- [0020 -- Scheduled weather sync](docs/decisions/0020-scheduled-weather-sync.md) -- revisits 0019's browser-only ingestion once real use showed it wasn't fresh enough: an hourly `pg_cron` job and one narrowly-scoped `service_role` Edge Function, the fallback 0019 had already named.
- [0021 -- The chat renders actual pictures, via raw SVG](docs/decisions/0021-chat-renders-svg-graphics.md) -- no fixed chart-type menu; the model writes self-contained SVG in a fenced code block and the frontend sanitizes (DOMPurify) and renders it, the same "one general capability, not a menu of shapes" instinct 0016 already applied to SQL.
- [0022 -- The chat can write data, confirmed and reversible](docs/decisions/0022-chat-writes-data-with-audit-and-rollback.md) -- a general write tool (any DML, never DDL), gated by a real confirm-before-commit click rather than the model's own judgment, with a generic audit trigger and field-level rollback as the actual safety net.
- [0023 -- Producer memory via embeddings](docs/decisions/0023-producer-memory-via-embeddings.md) -- structured, producer-editable memory entries plus a derived, rebuildable index over past conversations, both searched by one new tool via `pgvector`; memory writes reuse 0022's confirm-and-audit mechanism rather than getting a path of their own.

## Stack

| Concern | Choice |
|---|---|
| Database | [Supabase](https://supabase.com) (Postgres, Free tier) |
| Spatial | PostGIS |
| File storage | Supabase Storage -- reserved for photo attachments, deliberately not wired up yet (see [`docs/decisions/0009`](docs/decisions/0009-chat-based-observation-submission.md)) |
| Schema history | Supabase CLI migrations, in `supabase/migrations/` |
| Client | React (Vite), in `app/` -- see [`docs/decisions/0008`](docs/decisions/0008-app-as-research-tool.md) |
| Hosting | [Vercel](https://app-blue-ten-25.vercel.app), connected to this GitHub repo -- auto-deploys production from `main`, preview builds per branch/PR |
| Auth | Google Sign-In via Supabase Auth -- Testing status, explicit test-user allow-list |
| Server-side logic | Supabase Edge Functions, in `supabase/functions/` -- the only place a secret (like an API key) ever lives |
| AI | Anthropic Claude (Sonnet) -- writes and runs its own read-only SQL, see [`docs/decisions/0016`](docs/decisions/0016-chat-queries-directly.md) |

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch/PR/CI workflow this
repo follows.

## License

This code is shared publicly for portfolio purposes. All rights reserved
-- no license is granted for reuse.
