# 0020. Scheduled weather sync: pg_cron + one narrowly-scoped service_role function

**Status:** accepted. One sentence in the Decision below was wrong about a sibling function when it was written, and stayed wrong for six days -- see "Update (2026-09-21)".

## Context

[`0019`](0019-external-data-channels.md) deliberately chose browser-driven ingestion over `pg_cron`/`service_role` for v1, naming the real trade-off out loud: weather data only refreshes while a producer has the app open. It also named the fallback if that trade-off proved wrong -- `pg_cron` plus a narrowly-scoped `service_role` Edge Function, "still entirely inside Supabase, a small additive PR, not new infrastructure."

Real use showed the trade-off wasn't acceptable: the point of tracking weather is for it to be there when needed, not only when someone happened to have Growdy open recently. This ADR is that already-anticipated fallback, built now that there's a real reason to.

This isn't a reversal of 0019 as a whole -- the taxonomy, the Vault-per-source-credential design, the fully-structured-columns/injection-defense reasoning, and pull-only admin visibility all stand exactly as written. Only the "no service_role, no pg_cron/pg_net" sub-decision changes.

## Decision

**`pg_cron` and `pg_net` are enabled**, and a single scheduled job invokes one new Edge Function, `sync-scheduled-weather`, hourly -- Supabase's own documented pattern for scheduling an Edge Function via `pg_cron` + `pg_net`.

**`sync-scheduled-weather` is the only place in this codebase that uses `service_role`.** It builds its admin client from `SUPABASE_SECRET_KEYS`, auto-injected into every Edge Function's environment -- never a value anyone types, stores in a migration, or passes through a tool call. Everything else (`chat`, `ingest-weather`, the frontend) is unchanged; this is additive, not a replacement. Manually triggered sync (adding a source, "Sync now") stays exactly as useful as before -- for seeing data land immediately rather than waiting up to an hour.

**Authorization is a shared secret minted into Supabase Vault by migration, never seen by a human.** The migration creates a `weather_sync_trigger_secret` row using `gen_random_bytes` -- a value Postgres generates at apply-time, not something anyone types or a tool call transmits. The cron job's own SQL body reads that row by name to set an `X-Cron-Secret` header; the function checks it via a new `SECURITY DEFINER` function, `public.get_enabled_weather_sources_for_sync(p_trigger_secret)`, before doing anything else. Supabase's own `verify_jwt` gateway check doesn't fit here -- the caller is Postgres itself, not a signed-in user with a JWT -- so this function deploys with `verify_jwt: false` and authorizes itself, the same reason `chat` and `ingest-weather` already do.

**One new function does two jobs atomically: check the secret, then return every enabled source's decrypted credential.** `vault.decrypted_secrets` isn't reachable via PostgREST directly -- only `public`/`graphql_public` are exposed per `supabase/config.toml` -- the exact reason `private.get_decrypted_source_secret` already exists for the user-driven path. `get_enabled_weather_sources_for_sync` is that same idea applied to the scheduled path: it raises before touching anything if the secret doesn't match, and if it does, joins `data_sources` (`enabled = true`) to their Vault secrets in one query. `EXECUTE` is revoked from `PUBLIC` and granted only to `service_role` -- the same lesson this project already learned once (`20260915035815_revoke_public_execute_on_vault_helpers.sql`), applied from the start this time. This is the one deliberate, explicit cross-producer read in the project: every other credential-access path is scoped to exactly one caller's own source.

**The actual ingestion logic doesn't get a second implementation.** The fetch/parse/validate/upsert logic that already exists in `ingest-weather` moves into `_shared/weatherIngest.ts`; both the user-invoked path (`ingest-weather`, one source, forwarded JWT, unchanged behavior) and the scheduled path (`sync-scheduled-weather`, every enabled source, admin client) call the same `syncWeatherSourceChunk`. One definition of "how a Tempest reading gets validated and stored," not two that can drift -- the same principle 0019 already applied when `_shared/cors.ts` and `_shared/supabaseClient.ts` were introduced.

**Each source gets a bounded handful of chunks per run, not just one.** This closes a real gap 0019's design left open: a producer who added a source and closed the tab before backfill finished had no way to resume except reopening the app and clicking "Sync now" repeatedly -- nothing auto-resumed a stalled backfill. Now every enabled source, regardless of `backfill_status`, gets up to a few chunks each hour, so an interrupted backfill also completes on its own over time, gradually, without needing the whole multi-year history in one cron run.

## Consequences

- `last_synced_at` staleness for any enabled source is now bounded by roughly an hour, not by how long it's been since anyone opened the app.
- This is the only Edge Function in the project with cross-producer blast radius if it has a bug -- mitigated by doing exactly one thing (sync eligible weather sources, never arbitrary writes), the Vault-mediated caller check, and reusing the identical validated/structured-column ingestion path the user-driven function already uses, so its correctness bar is the same, not lower.
- A future second weather provider needs no changes here -- the scheduled function loops `data_sources` generically; provider-specific logic lives entirely in `_shared/weatherIngest.ts` and whatever a second provider adds alongside it.
- If Tempest's real rate limits (still unconfirmed per 0019's open items) turn out to be tight, hourly sync across many producers' stations could need throttling or staggering -- not addressed here, deferred until real multi-producer, multi-station use makes it a real problem rather than a hypothetical one.

## Update (2026-09-21): `chat` was not, in fact, authorizing itself

The Decision above ends a sentence with "the same reason `chat` and
`ingest-weather` already do." The first half of that was not true. It
described a pattern this ADR was following rather than a check those two
functions had, and `chat` had no such check: its handler answered
`OPTIONS`, then went straight to building a prompt and calling Anthropic.
A `POST` carrying no `Authorization` header and no `apikey` got a real
model call, billed to this project's key. Reproduced against the live
deployment on 2026-09-21, six days after this ADR was accepted.

The reason nobody noticed is worth keeping, because it will recur:
`createUserScopedClient` forwards whatever `Authorization` header
arrived, including none, so every RLS-scoped query an anonymous request
made came back empty -- and the model answered anyway, from an empty
database, with no error at any layer. Reading the code, "every query is
RLS-scoped" looks like the control. It is not. It bounds what a caller
can *read*; it does not decide whether the request should have been
served, and for a function whose expensive part is an external API call
rather than a query, it bounds nothing that costs anything.

What this ADR got right is unchanged: `verify_jwt: false` plus
self-authorization is the correct shape, and `sync-scheduled-weather`
implemented it correctly the day it shipped. What changed is that the
"authorizes itself" half is now a real, shared step every
browser-callable function performs before anything else --
`resolveProducerId` in `supabase/functions/_shared/supabaseClient.ts`,
applied in `chat`, `ingest-weather` and `add-weather-source`. The two
weather functions already failed closed by accident, because the first
thing each did was a query or a call with the caller's own credentials;
that is the function declining to be useful rather than a control, which
is the same distinction migration `20260921040000` drew about a `PUBLIC`
grant one day earlier.

## Update (2026-09-21): "never seen by a human" was true of the Vault row and false of the header

The Decision above says authorization is **"a shared secret minted into
Supabase Vault by migration, never seen by a human."** The minting is
exactly as described --- `gen_random_bytes` at apply time, never typed,
never through a tool call. What the sentence misses is what happens to
the value a moment later.

The cron job reads it into an `X-Cron-Secret` header and hands it to
`net.http_post`. `pg_net` stores each queued request whole --- url,
headers, body --- in `net.http_request_queue` until its background worker
drains the row, which takes about a second. On the live project,
`authenticated` has `USAGE` on the `net` schema and `SELECT` on that
table, and the table carries no RLS. So the secret is readable in
plaintext, by any signed-in user, for about a second, every time a job
fires --- hourly for the weather sync and every six hours for the other
two. The chat model can read it too: `execute_readonly_query` runs as
`authenticated` and this is a select.

**Growdy cannot revoke that grant.** `net.http_request_queue` is owned by
`supabase_admin` and migrations run as `postgres`. A
`revoke all on net.http_request_queue from public` was attempted inside a
`DO` block and rejected, with the ACL unchanged afterwards. The grant
belongs to the platform.

What a captured secret was worth is worth saying plainly, because it
shapes the fix. All three functions return counts ---
`{synced, errors}`, `{scanned, candidatesCreated, errors}` --- and no
producer data reaches a caller. A replay could make the project spend
money on Tempest, Anthropic and Voyage, and could put spurious candidates
in a review queue. It could not read anybody's vineyard.

So the secret stops travelling. `20260921080000` has the cron jobs send
an HMAC over the secret name and a five-minute bucket
(`private.cron_trigger_token`), and the verifier recompute it
(`private.cron_token_valid`). The Vault row never enters `pg_net`; what
sits in that queue for a second is worth five to ten minutes rather than
forever, and only to somebody already polling at that second. A
previously captured secret stops working the moment that migration
applies --- verified, along with the rest of the window behaviour, before
it was written.

The same migration collapses six copies of the comparison into one
verifier. Six places to keep true is the same shape as the error in the
Decision above: a claim about `chat` that was true of a pattern and not
of the code, which nothing noticed for six days.
