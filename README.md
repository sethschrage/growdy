# Growdy

A database for capturing information about plants in a parcel of land over
time -- what's planted, where, when, and what's observed about it.

A producer reaches it through an app (see `app/`): sign in with Google
and ask an AI-guided chat about vineyard data in plain language -- the
chat writes and runs its own read-only SQL to answer, rather than
picking from a fixed menu of question types. Direct SQL is still how the
schema gets maintained, but it is no longer how the data gets used. It's
still a research tool, not a finished product -- built to find out what
field use and other producers actually need before building more of
either the schema or the app. See
[`docs/decisions/0008`](docs/decisions/0008-app-as-research-tool.md)
and [`docs/decisions/0016`](docs/decisions/0016-chat-queries-directly.md).

## Two clients, one backend

The producer works from a phone, standing in a vineyard, so **the phone
gets a native SwiftUI client and that becomes the full-featured one.**
New feature work goes there. **The React app in `app/` is frozen**: it
stays deployed as a desktop surface -- reviewing vineyard data and
history on a screen big enough to see it -- and gets no new features
until it is rebuilt later as a second thin client against the same API.

Everything that is not a user interface is shared and is untouched by
the split: the Postgres schema and its RLS, the six Edge Functions, the
auth model, the prompts. What carries between the two clients is the API
and the design, never code -- SwiftUI does not transpile to the web and
the reverse is not a thing either.

Where that stands today: the SwiftUI client is not written yet, so what
runs on the producer's phone is still the Capacitor shell from
[`0029`](docs/decisions/0029-ios-shell-and-native-sign-in.md) wrapping
the React build. The decision and the measurements behind it are in
[`docs/decisions/0038`](docs/decisions/0038-the-phone-gets-its-own-client.md).
The first thing it asked for was not Swift: the API contract had never
been written down, because one client could be its own specification and
two cannot. It is now --
[`docs/api-contract.md`](docs/api-contract.md).

## Status

Early. The core hierarchy (producer/parcel/plot/row/planting) is in
place, and the app over it has a Google-authenticated, AI-guided chat
for asking questions about the data, plus a browsable history of every
past conversation. An answer arrives as it is
written, under a status line that counts the seconds and opens into the
steps behind it, since a twenty-second wait otherwise looks the same
whether the chat is running its ninth query or stuck; a finished answer
reports what it looked at and roughly what it cost, because a token
count on its own is not a number a producer can price. The chat can also
pull in outside context -- weather, device location, grapevine
phenology -- through a Knowledge screen where a producer manages what's
connected
(see [`docs/decisions/0019`](docs/decisions/0019-external-data-channels.md)).
A separate, non-chat part of the app handles the producer's own
day-to-day data directly: a form for writing down an observation, and a
read-only browser over their own parcels/plots/rows/plantings. An
observation can also start as a photograph -- attached in chat, read
with the producer's own vineyard in view, and dated from the photo's own
capture time rather than the moment it was uploaded. An observation
captured with no signal is held on the phone and sent when the
connection returns -- every capture goes through that queue, not just a
failed one, so the code that runs in a block with no bars is the code
that runs at a desk with five (see
[`docs/decisions/0037`](docs/decisions/0037-what-happens-with-no-signal.md)).
Nothing reaches the permanent record without a producer confirming it:
every path, typed or photographed or suggested by the chat, files a
candidate into one review queue (see
[`docs/decisions/0030`](docs/decisions/0030-every-observation-through-one-queue.md)).

All of that is on the producer's phone now, as an iOS build made in
Xcode and installed directly, and it is the client every release bullet
is exercised on before the tag ([`CONTRIBUTING.md`](CONTRIBUTING.md),
Releases step 2) -- a green CI run is not evidence that a producer got
an answer. There is no App Store listing, and there cannot be one until
Sign in with Apple sits alongside Google, which needs a paid developer
account. So "not in the Store" is the accurate statement and "not
shipped" is not: the one producer growdy has opens it from a home
screen. The browser at the Vercel URL is the other way in, and stays
one -- frozen, but deployed.

That phone build is the Capacitor shell, and replacing it with the
native client is the work in front of this project. None of it is
written yet.

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
- [0021 -- The chat renders actual pictures, via raw SVG](docs/decisions/0021-chat-renders-svg-graphics.md) -- no fixed chart-type menu; the model wrote self-contained SVG in a fenced code block and the frontend sanitized (DOMPurify) and rendered it, the same "one general capability, not a menu of shapes" instinct 0016 already applied to SQL. **Withdrawn on 2026-09-21** alongside [0027](docs/decisions/0027-public-artifact-links.md): with nothing left to save or share a picture, what remained was a drawing capped to fit a chat bubble. The gap it closed -- a trend or comparison that reads badly as prose -- is open again, for the native client to answer.
- [0022 -- The chat can write data, confirmed and reversible](docs/decisions/0022-chat-writes-data-with-audit-and-rollback.md) -- a general write tool (any DML, never DDL), gated by a real confirm-before-commit click rather than the model's own judgment, with a generic audit trigger and field-level rollback as the actual safety net. The database mechanism shipped first; the actual `chat` tool, confirm/decline UI, and audit trigger attachment followed later once a real gap surfaced (see its Status).
- [0023 -- Producer memory via embeddings](docs/decisions/0023-producer-memory-via-embeddings.md) -- structured memory entries plus a derived, rebuildable index over past conversations, both embedded via Voyage AI on a schedule and searched by one new `search_memory` chat tool via `pgvector`. Both the read and write sides are live: the chat can search memory and propose writing a new entry, confirmed the same way any other write is (0022).
- [0024 -- Web access is a Provider in the Category -> Provider -> Source taxonomy](docs/decisions/0024-web-access-as-a-provider.md) -- Anthropic's own hosted web_search/web_fetch, sitting in the same taxonomy as a weather station rather than a special-cased tool. Shipped opt-in at first; real use showed the toggle wasn't earning its keep for a capability this tightly bounded, so it's been always-on, no toggle, since the next day.
- [0025 -- Per-parcel sharing, cascading through its own hierarchy](docs/decisions/0025-parcel-sharing-and-self-serve-creation.md) -- a parcel's owner could share just that parcel (Editor or Viewer role) with another producer, without exposing either side's other parcels or accounts. **Sharing was withdrawn by [0028](docs/decisions/0028-what-uat-removed.md)** -- parcels are what Growdy sells, so giving one away undercuts the seat. Self-serve parcel *creation* went with it in the same pass, for the mirror-image reason: if a parcel is the seat, minting them for free is the same hole from the other direction.
- [0026 -- Self-serve producer onboarding](docs/decisions/0026-producer-onboarding.md) -- a brand-new sign-in with no `profiles` row got a real wizard (create a producer, optionally a first parcel) instead of the silent gap that had existed since day one. **Superseded by [0028](docs/decisions/0028-what-uat-removed.md)**: the wizard is removed until there's a purchase flow to attach it to, and an account with no producer now says so and stops. The `SECURITY DEFINER` RPC it used stays, as the way a producer is created by hand in the meantime.
- [0027 -- Sharing a chat graphic via an unguessable public link](docs/decisions/0027-public-artifact-links.md) -- the app's one and only signed-out-reachable surface, reached through a narrow `get_public_artifact(id)` function rather than an RLS grant to `anon`, since a table grant could be turned into a listable collection and a function lookup by exact id can't. **Withdrawn on 2026-09-21**, removed outright rather than replaced: a page a stranger opens in a browser is exactly what a native iOS client can't carry, and the two graphics ever saved weren't worth keeping. Nothing in this database is reachable without a session again; the narrow-function shape is still the bar for whatever asks to be public next.
- [0028 -- Five features removed after the first real UAT pass](docs/decisions/0028-what-uat-removed.md) -- the review gate on observations, parcel sharing, self-serve parcel creation, the onboarding wizard and the plot status grid all removed rather than repaired, after a forty-check pass over every release found that three of them had never once been used in production and two could not have been. Observations now count as data when logged and are corrected by deleting them, which the audit log makes reversible.
- [0029 -- An iOS shell, and sign-in that suits it](docs/decisions/0029-ios-shell-and-native-sign-in.md) -- the same web build wrapped in Capacitor, with a native ID-token sign-in rather than the web's OAuth redirect, which cannot complete inside the shell. The shell is what runs on the producer's phone today, built in Xcode and installed directly; there is still no App Store listing, because the Store requires Sign in with Apple alongside Google and that needs a paid developer account. **The shell half is superseded by [0038](docs/decisions/0038-the-phone-gets-its-own-client.md)**, which builds the phone a client of its own rather than a wrapper around the web one. The sign-in half outlives it: `signInWithIdToken` takes a token from the OS account sheet, so there is no redirect, no custom scheme and no allow-list entry, and that is as true in SwiftUI as it is in Capacitor.
- [0030 -- Every observation enters through one review queue](docs/decisions/0030-every-observation-through-one-queue.md) -- photo attachment in chat, and the decision it forced. `observation_candidates` becomes the only way into `observations` -- not a second status column, which is what 0028 correctly killed, but the queue that already had a screen a producer could reach. Recorded as a preference for curation rather than as a safety claim, since the drift argument only covers what a model wrote.
- [0031 -- What this project tests, and what it doesn't](docs/decisions/0031-what-this-project-tests.md) -- Vitest and Testing Library, CI on every PR, and rules written as obligations on specific kinds of code rather than as a coverage threshold, which rewards testing what is easy to reach over what is expensive to get wrong.
- [0032 -- The client is organised by feature, over a shared data layer](docs/decisions/0032-client-organised-by-feature.md) -- thirty flat files become feature folders with every table, view and RPC call behind one typed layer, so the GIS map that comes next is a folder rather than fifteen more files in a pile.
- [0033 -- What goes in the cached prompt, and what must never](docs/decisions/0033-what-goes-in-the-cached-prompt.md) -- two cache breakpoints split by how fast each half changes: the instructions, tool definitions and schema description in the first, since that text is identical for every producer, and what this producer has switched on in the second. Nothing that varies per request may go in either -- one volatile token makes every request a miss *and* charges the write premium, which costs more than not caching at all.
- [0034 -- A schema change has to explain itself](docs/decisions/0034-a-schema-change-has-to-explain-itself.md) -- the model was handed twelve hand-listed tables, none of the fourteen foreign keys, and 115 uncommented columns. Every public relation is now described by default with `NOT_DESCRIBED` holding the exclusions and their reasons; a migration that creates a table or adds a column answers six questions in its header, refused by a hook before it can even be written; and the column backlog is a ratchet that fails in both directions, since a ceiling left too high after the work is done grows back.
- [0035 -- What the docs are checked against, and what cannot be](docs/decisions/0035-what-the-docs-are-checked-against.md) -- of 44 candidate checks over the base docs and the ADRs, the ten that survived are the ones something else in the repo can contradict without anyone exercising judgement: links and anchors, ADR numbering, the Edge Functions a diagram draws, tables, cron jobs. Four were already failing. Nothing here can tell whether a paragraph is still true, which is why calling it documentation CI would be the dangerous reading.
- [0036 -- A tenancy check runs once per statement, not once per row](docs/decisions/0036-rls-predicates-are-evaluated-once.md) -- `private.user_can_access_producer(producer_id)` takes the row's own column, so a `SECURITY DEFINER` call ran per row: 1,500 ms on a five-row weather query, against 15 ms for `producer_id = (select private.current_producer_id())`, which Postgres resolves once as an InitPlan. Thirty policies across fourteen tables rewritten, provably the same test, and a check fails the next one written the old way.
- [0037 -- What happens with no signal](docs/decisions/0037-what-happens-with-no-signal.md) -- a producer standing in a block with no bars got WebKit's `Load failed` and lost the question. The app now names the situation rather than the mechanism, keeps a failed send whole and retries it, and writes every observation capture to an IndexedDB queue that is flushed immediately -- one path rather than a fallback only ever exercised where nobody is watching it.
- [0038 -- The phone gets its own client](docs/decisions/0038-the-phone-gets-its-own-client.md) -- the iOS app is rebuilt in SwiftUI and becomes the full-featured client; the React app is frozen as a desktop surface and rebuilt later against the same API. Decided on measurement: 436 lines of client code exist only to fight `WKWebView` keyboard and gesture behaviour, six of `0.15.0`'s forty-two commits were touch fixes, and a device probe proved `backdrop-filter` silently ignores an SVG filter, so the intended glass is unreachable in CSS at any price. The schema, the Edge Functions and the auth model are shared and untouched.

## Stack

| Concern | Choice |
|---|---|
| Database | [Supabase](https://supabase.com) (Postgres, Free tier) |
| Spatial | PostGIS, installed since the first week. Three columns use it, all points: `planting.location`, `observations.photo_location`, `observation_candidates.photo_location`. Parcels, plots and rows carry no boundary geometry at all -- see [`docs/architecture.md`](docs/architecture.md#reading-this-diagram) for what that means for the map `0038` is aimed at |
| File storage | Supabase Storage -- vineyard photos attached in chat, in a private bucket with tenancy enforced on the object path (see [`docs/decisions/0030`](docs/decisions/0030-every-observation-through-one-queue.md)); reads go through short-lived signed URLs, never a public bucket |
| Schema history | Supabase CLI migrations, in `supabase/migrations/` |
| Tests | Vitest + Testing Library, in `app/` beside what they test -- run in CI on every PR alongside `tsc` and `oxlint` |
| Client, primary | A native SwiftUI iOS app, which becomes the full-featured one (see [`docs/decisions/0038`](docs/decisions/0038-the-phone-gets-its-own-client.md)). **Not written yet** -- there is no Swift target in this repo, and no decision recorded yet about where one would live |
| Client, frozen | React (Vite), in `app/` -- organised by feature over a shared data layer (see [`docs/decisions/0032`](docs/decisions/0032-client-organised-by-feature.md)), and [`0008`](docs/decisions/0008-app-as-research-tool.md) for why it exists at all. Frozen by `0038` as a desktop surface: still deployed, still maintained, no new features |
| iOS, today | Capacitor shell wrapping the React build, in `app/ios/` -- plugins: camera, geolocation, social login, keyboard. Built in Xcode and installed on the producer's phone, and what each release is exercised on; no App Store listing, and Sign in with Apple is required before there can be one (see [`docs/decisions/0029`](docs/decisions/0029-ios-shell-and-native-sign-in.md)) |
| Hosting | [Vercel](https://app-blue-ten-25.vercel.app), connected to this GitHub repo -- auto-deploys production from `main`, preview builds per branch/PR |
| Auth | Google Sign-In via Supabase Auth -- Testing status, explicit test-user allow-list. Web uses the OAuth redirect; iOS uses a native ID token, since the redirect can't complete inside the shell (`0029`). The token path needs no redirect at all, so it is the half of `0029` a SwiftUI client inherits unchanged |
| Server-side logic | Supabase Edge Functions, in `supabase/functions/` -- the only place a secret (like an API key) ever lives |
| AI | Anthropic Claude (Sonnet) -- writes and runs its own read-only SQL, see [`docs/decisions/0016`](docs/decisions/0016-chat-queries-directly.md) |

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch/PR/CI workflow this
repo follows.

## License

This code is shared publicly for portfolio purposes. All rights reserved
-- no license is granted for reuse.
