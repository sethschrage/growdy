# Growdy

A database for capturing information about plants in a parcel of land over
time -- what's planted, where, when, and what's observed about it.

Most interaction still happens directly against the database, but a
real app now exists alongside it (see `app/`): producers sign in with
Google and use one AI-guided chat to both ask questions about what's
planted where and log field observations, instead of a form or direct
SQL for either. It's still a research tool, not a finished product --
built to find out what field use and other producers actually need
before building more of either the schema or the app. See
[`docs/decisions/0008`](docs/decisions/0008-app-as-research-tool.md),
[`docs/decisions/0009`](docs/decisions/0009-chat-based-observation-submission.md),
and [`docs/decisions/0012`](docs/decisions/0012-unified-chat-agent.md).

## Status

Early. The core hierarchy (producer/parcel/plot/row/planting) is in
place, and a companion app now exists with one chat for both asking
questions and logging field observations, Google-authenticated,
AI-guided throughout, plus a browsable history of every past
conversation. See open and merged PRs for current progress, and
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
- [0010 -- Read-only Q&A chat resolves against known views](docs/decisions/0010-read-only-qa-chat.md) -- answering a question reuses the same "AI drafts intent, client resolves and executes" split as observation submission, never a generated query.
- [0011 -- Conversation history is a new table, written by the client](docs/decisions/0011-conversation-history.md) -- browsing past chats needs a session-level record neither existing table provides; the client writes it after every message, not an Edge Function.
- [0012 -- One chat agent with a growing tool list](docs/decisions/0012-unified-chat-agent.md) -- merges the two chat modes into one Edge Function and tool list; the actual safety backstop was always the confirm-before-write step and the database's pending-only insert policy, not which function held which tool.
- [0013 -- The model composes the answer, not a client template](docs/decisions/0013-model-composed-query-answers.md) -- the client still resolves every question the same safe, fixed way, but now sends the result back to the model to write the actual answer, so it reflects how the question was asked instead of a one-size-fits-all template.
- [0014 -- An observation can stand on its own](docs/decisions/0014-open-ended-observations.md) -- a note doesn't have to be about one specific plant; `planting_id` is optional so a general observation has somewhere to go instead of being refused.

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
