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
day-to-day data directly: a form for writing down an observation, and a
read-only browser over their own parcels/plots/rows/plantings. An
observation can also start as a photograph -- attached in chat, read
with the producer's own vineyard in view, and dated from the photo's own
capture time rather than the moment it was uploaded. Nothing reaches the
permanent record without a producer confirming it: every path, typed or
photographed or suggested by the chat, files a candidate into one review
queue (see
[`docs/decisions/0030`](docs/decisions/0030-every-observation-through-one-queue.md)).
See open and merged PRs for current progress, and
[`docs/decisions/`](docs/decisions) for the reasoning behind each
structural and app choice.

## Data model

See [`docs/data-model.md`](docs/data-model.md) for a diagram of every
table and how they relate.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for a diagram of where
each piece runs and how they talk to each other -- the app, Vercel,
Supabase, and Anthropic.

## Monitoring

See [`docs/monitoring.md`](docs/monitoring.md) for every place in the
system that needs a human to look at it -- suggested observations
waiting to be confirmed, chat feedback, data-source health, and the
failures that are logged but that nothing currently watches.

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
- [0022 -- The chat can write data, confirmed and reversible](docs/decisions/0022-chat-writes-data-with-audit-and-rollback.md) -- a general write tool (any DML, never DDL), gated by a real confirm-before-commit click rather than the model's own judgment, with a generic audit trigger and field-level rollback as the actual safety net. The database mechanism shipped first; the actual `chat` tool, confirm/decline UI, and audit trigger attachment followed later once a real gap surfaced (see its Status).
- [0023 -- Producer memory via embeddings](docs/decisions/0023-producer-memory-via-embeddings.md) -- structured memory entries plus a derived, rebuildable index over past conversations, both embedded via Voyage AI on a schedule and searched by one new `search_memory` chat tool via `pgvector`. Both the read and write sides are live: the chat can search memory and propose writing a new entry, confirmed the same way any other write is (0022).
- [0024 -- Web access is a Provider in the Category -> Provider -> Source taxonomy](docs/decisions/0024-web-access-as-a-provider.md) -- Anthropic's own hosted web_search/web_fetch, sitting in the same taxonomy as a weather station rather than a special-cased tool. Shipped opt-in at first; real use showed the toggle wasn't earning its keep for a capability this tightly bounded, so it's been always-on, no toggle, since the next day.
- [0025 -- Per-parcel sharing, cascading through its own hierarchy](docs/decisions/0025-parcel-sharing-and-self-serve-creation.md) -- a parcel's owner could share just that parcel (Editor or Viewer role) with another producer, without exposing either side's other parcels or accounts. **Sharing was withdrawn by [0028](docs/decisions/0028-what-uat-removed.md)** -- parcels are what Growdy sells, so giving one away undercuts the seat. Self-serve parcel *creation* went with it in the same pass, for the mirror-image reason: if a parcel is the seat, minting them for free is the same hole from the other direction.
- [0026 -- Self-serve producer onboarding](docs/decisions/0026-producer-onboarding.md) -- a brand-new sign-in with no `profiles` row got a real wizard (create a producer, optionally a first parcel) instead of the silent gap that had existed since day one. **Superseded by [0028](docs/decisions/0028-what-uat-removed.md)**: the wizard is removed until there's a purchase flow to attach it to, and an account with no producer now says so and stops. The `SECURITY DEFINER` RPC it used stays, as the way a producer is created by hand in the meantime.
- [0027 -- Sharing a chat graphic via an unguessable public link](docs/decisions/0027-public-artifact-links.md) -- the first signed-out-reachable surface in the app; a narrow `get_public_artifact(id)` function, not an RLS grant to `anon`, since a table grant could be turned into a listable collection and a function lookup by exact id can't.
- [0028 -- Five features removed after the first real UAT pass](docs/decisions/0028-what-uat-removed.md) -- the review gate on observations, parcel sharing, self-serve parcel creation, the onboarding wizard and the plot status grid all removed rather than repaired, after a forty-check pass over every release found that three of them had never once been used in production and two could not have been. Observations now count as data when logged and are corrected by deleting them, which the audit log makes reversible.
- [0029 -- An iOS shell, and sign-in that suits it](docs/decisions/0029-ios-shell-and-native-sign-in.md) -- the same web build wrapped in Capacitor, with a native ID-token sign-in rather than the web's OAuth redirect, which cannot complete inside the shell. **Not shipped**: the App Store requires Sign in with Apple alongside Google, and that needs a paid developer account.
- [0030 -- Every observation enters through one review queue](docs/decisions/0030-every-observation-through-one-queue.md) -- photo attachment in chat, and the decision it forced. `observation_candidates` becomes the only way into `observations` -- not a second status column, which is what 0028 correctly killed, but the queue that already had a screen a producer could reach. Recorded as a preference for curation rather than as a safety claim, since the drift argument only covers what a model wrote.
- [0031 -- What this project tests, and what it doesn't](docs/decisions/0031-what-this-project-tests.md) -- Vitest and Testing Library, CI on every PR, and rules written as obligations on specific kinds of code rather than as a coverage threshold, which rewards testing what is easy to reach over what is expensive to get wrong.
- [0032 -- The client is organised by feature, over a shared data layer](docs/decisions/0032-client-organised-by-feature.md) -- thirty flat files become feature folders with every table, view and RPC call behind one typed layer, so the GIS map that comes next is a folder rather than fifteen more files in a pile.

## Stack

| Concern | Choice |
|---|---|
| Database | [Supabase](https://supabase.com) (Postgres, Free tier) |
| Spatial | PostGIS |
| File storage | Supabase Storage -- vineyard photos attached in chat, in a private bucket with tenancy enforced on the object path (see [`docs/decisions/0030`](docs/decisions/0030-every-observation-through-one-queue.md)); reads go through short-lived signed URLs, never a public bucket |
| Schema history | Supabase CLI migrations, in `supabase/migrations/` |
| Tests | Vitest + Testing Library, in `app/` beside what they test -- run in CI on every PR alongside `tsc` and `oxlint` |
| Client | React (Vite), in `app/` -- organised by feature over a shared data layer (see [`docs/decisions/0032`](docs/decisions/0032-client-organised-by-feature.md)), and [`0008`](docs/decisions/0008-app-as-research-tool.md) for why it exists at all |
| iOS | Capacitor shell wrapping the same build, in `app/ios/` -- **not shipped**: no App Store listing, and Sign in with Apple is required before submission (see [`docs/decisions/0029`](docs/decisions/0029-ios-shell-and-native-sign-in.md)) |
| Hosting | [Vercel](https://app-blue-ten-25.vercel.app), connected to this GitHub repo -- auto-deploys production from `main`, preview builds per branch/PR |
| Auth | Google Sign-In via Supabase Auth -- Testing status, explicit test-user allow-list. Web uses the OAuth redirect; iOS uses a native ID token, since the redirect can't complete inside the shell (`0029`) |
| Server-side logic | Supabase Edge Functions, in `supabase/functions/` -- the only place a secret (like an API key) ever lives |
| AI | Anthropic Claude (Sonnet) -- writes and runs its own read-only SQL, see [`docs/decisions/0016`](docs/decisions/0016-chat-queries-directly.md) |

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch/PR/CI workflow this
repo follows.

## License

This code is shared publicly for portfolio purposes. All rights reserved
-- no license is granted for reuse.
