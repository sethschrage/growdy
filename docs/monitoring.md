# Monitoring

Every place in the system that needs a human to look at it, and every
place a real failure currently ends up. This is the inventory
[`0019`](decisions/0019-external-data-channels.md) named directly but
deferred: *"alerts (unprompted, pushed notification) [are] a distinct
future direction, gated on a real missed incident, not something to
build a piece of speculatively here."* Nothing here pushes yet -- every
one of these is a pull: someone has to know to go look. That's the gap
this document exists to close first, before any actual paging/emailing
gets built on top of it.

Three different audiences check different parts of this list: a
producer sees their own pending items and feedback buttons in the app
already; a maintainer (today, just Seth) is the only one who can see
the rest -- direct SQL, the Supabase dashboard, or Vercel's dashboard.
"Support" below means whoever is wearing that second hat.

## 1. Review queues -- someone has to act on these

Three independent tables hold rows waiting on a human decision. None of
them notify anyone; a row can sit forever.

| Table | Column | Values | Who resolves it, how |
|---|---|---|---|
| `observations` | `status` | `pending` (default) / `approved` / `rejected` | **Nobody, via any UI.** [`20260913045735_observations_status_and_transcript.sql:13-14`](../supabase/migrations/20260913045735_observations_status_and_transcript.sql) says outright: "No update policy for status yet... approving/rejecting happens by hand via direct SQL." Confirmed still true -- no later migration ever grants `update` on this column. Every observation ever submitted (structured form or, historically, chat) sits `pending` until a maintainer runs SQL. |
| `observation_candidates` | `status` | `pending` (default) / `confirmed` / `dismissed` | The producer, in-app, via the review queue populated by the 6-hourly `scan-conversations-for-observations` job ([`20260916200228_observation_candidates.sql`](../supabase/migrations/20260916200228_observation_candidates.sql)). |
| `plant_types` | `status` | `pending` (default) / `canonical` / `rejected` | **Nobody, via any UI either.** [`20260913003426_plant_types.sql:20-22`](../supabase/migrations/20260913003426_plant_types.sql) -- any producer typing a new variety/scion/rootstock name implicitly proposes one; a maintainer promotes it to `canonical` (visible to everyone) with a plain `UPDATE`, "no automated/self-service promotion exists yet." |
| `pending_writes` | `status` | `pending` (default) / `applied` / `declined` | The producer, in the same chat session, by clicking confirm/decline on a chat-drafted write ([`20260916173224_write_tool_audit_and_rollback.sql:17-24`](../supabase/migrations/20260916173224_write_tool_audit_and_rollback.sql)). A row stuck `pending` well past a normal session length (minutes, not hours) means the confirm/decline path itself broke, not that a producer is still deciding. |

Check counts any time with:

```sql
select 'observations pending' as signal, count(*) from public.observations where status = 'pending'
union all select 'observation_candidates pending', count(*) from public.observation_candidates where status = 'pending'
union all select 'plant_types pending', count(*) from public.plant_types where status = 'pending'
union all select 'pending_writes stuck', count(*) from public.pending_writes where status = 'pending' and created_at < now() - interval '1 hour';
```

## 2. Chat feedback -- not a table, a jsonb search

The 👍/👎 buttons ([`app/src/Chat.tsx:106-153`](../app/src/Chat.tsx)) write
`feedback: 'up' | 'down'` onto a message object inside
`conversations.transcript` (jsonb array) -- there is no `chat_feedback`
table. Finding a bad rating means querying into the blob:

```sql
select c.id, c.producer_id, c.updated_at
from conversations c, jsonb_array_elements(c.transcript) as msg
where msg->>'feedback' = 'down'
order by c.updated_at desc;
```

`conversations.updated_at` is client-set on every transcript write
([`app/src/useConversationLog.ts:52-55`](../app/src/useConversationLog.ts)),
so it's safe to use for "has this conversation changed since I last
checked."

## 3. Data-source health -- the one place this project already tracks itself

`data_sources.last_error` / `last_warning`
([`20260915033647_data_sources.sql:20-21`](../supabase/migrations/20260915033647_data_sources.sql))
are the only health columns in this schema. `last_error` blocks storage
and is cleared on the next successful sync; `last_warning` means it
stored the data anyway but noticed something off (e.g. a provider's
response shape changed). Right now, live:

```sql
select name, external_id, last_warning, last_synced_at
from public.data_sources where last_warning is not null;
-- "Lockehaven Field" / 415230: "observation array had 22 fields, expected 18
--  -- Tempest's response shape may have changed" (as of 2026-09-17)
```

That's a real, currently-open item sitting unseen -- exactly the kind of
thing this document exists to surface. Per
[`0019`](decisions/0019-external-data-channels.md#L94-98), a producer
sees their own source's `last_error`/`last_warning` directly in the app;
a maintainer only sees it by running this query.

## 4. Failures that are logged, but nowhere anyone looks

This is the category the database signals above don't cover at all:
every Edge Function catches its own crashes and calls `console.error`,
which reaches Supabase's platform log stream and *only* that -- never a
table, never anything polled. Real call sites:

| File:line | What it logs | Reaches `data_sources.last_error`? |
|---|---|---|
| [`chat/index.ts:436`](../supabase/functions/chat/index.ts) | `chat crashed: ${err}` -- the whole request threw | n/a |
| [`chat/index.ts:401`](../supabase/functions/chat/index.ts) | Hit `MAX_TOOL_ITERATIONS` with no real answer -- producer silently gets "That took more searching than expected," not an error | n/a |
| [`chat/index.ts:85,121`](../supabase/functions/chat/index.ts) | The schema-description / data-channel-context setup queries failed | n/a |
| [`scan-conversations-for-observations/index.ts:120`](../supabase/functions/scan-conversations-for-observations/index.ts) | One conversation failed to classify/insert/mark-scanned | n/a |
| [`scan-conversations-for-observations/index.ts:88`](../supabase/functions/scan-conversations-for-observations/index.ts) | The whole batch's RPC call failed | n/a |
| [`ingest-weather/index.ts:64`](../supabase/functions/ingest-weather/index.ts) | The user-driven sync crashed *before* reaching `syncWeatherSourceChunk` (bad request, RLS-denied source, missing secret) | **No** -- distinct from the narrower `try/catch` inside `_shared/weatherIngest.ts:207-212` that does set `last_error` |
| [`app/src/Chat.tsx:84`](../app/src/Chat.tsx) | `chat function invoke failed` | **No, and never can be** -- this is the browser's own console. A total network failure calling the Edge Function never reaches any server-side log at all. Known, accepted blind spot. |

**Two extra traps specific to the pg_cron-scheduled jobs**, confirmed
live against `growdybase` on 2026-09-17:

- `cron.job_run_details.status = 'succeeded'` only means the `net.http_post`
  call was queued without a Postgres-level error -- pg_net is fire-and-forget,
  so this says nothing about what the Edge Function actually returned.
- The Edge Function itself then catches its own per-item errors and still
  returns HTTP `200` with an `errors` array in the body -- so even the
  real response code looks clean. The only place the actual outcome
  lives is the response body, in `net._http_response.content`.

**A live example, found while writing this doc:** every run of
`scan-conversations-for-observations` (every 6 hours since it shipped)
has been failing on **every single conversation**, and both layers above
report success regardless:

```sql
select content from net._http_response order by created desc limit 1;
-- {"scanned":0,"candidatesCreated":0,"errors":["<uuid>: Error: permission
--   denied for table conversations", ... x19, "<uuid>: Error: permission
--   denied for table observation_candidates"]}
```

Root cause: `service_role` was never granted `update` on `conversations`
or `insert` on `observation_candidates` -- only `select`/`insert`/`update`
went to `authenticated` when those tables were created. This is the
*exact* bug `20260915050538_service_role_weather_table_grants.sql`
already fixed once for `data_sources`/`weather_observations` a day
earlier; the fix just never carried forward to the tables the next
day's migration needed. Confirmed directly against
`information_schema.role_table_grants`. Fixed alongside this doc in
`20260917020100_scan_conversations_service_role_grants.sql`.

## 5. Supabase platform-level

- **Security/performance advisors** (`get_advisors`, or Dashboard ->
  Advisors). [`CONTRIBUTING.md`](../CONTRIBUTING.md) already says to
  check these after every migration; nothing currently reminds anyone
  outside of that moment. Real findings as of 2026-09-17 (re-check
  rather than trust this list): `pg_net` extension installed in
  `public` schema (should move to `extensions`); two `SECURITY DEFINER`
  functions callable by `anon` -- `get_public_artifact` is intentional
  ([`0027`](decisions/0027-public-artifact-links.md)), `rls_auto_enable`
  is not defined by any migration in this repo at all (`pg_get_functiondef`
  shows it owned by `postgres`, not the migration-applying role) -- it's
  Supabase's own platform-injected event trigger that auto-enables RLS on
  any new `public` table, a defense-in-depth default, not a growdy
  artifact. Harmless if called directly outside its event-trigger context
  (`pg_event_trigger_ddl_commands()` only returns rows during a live DDL
  event), which is why the linter still flags it as anon-callable; leaked-
  password protection disabled in Auth; 18 unused indexes (INFO-level,
  expected at this scale, not urgent).
- **pg_cron job health** -- `select * from cron.job_run_details order by
  start_time desc` for the two scheduled jobs (`sync-weather-sources-hourly`,
  `scan-conversations-for-observations-6h`), but see the fire-and-forget
  trap in section 4 -- always cross-check `net._http_response.content`
  too, not just `cron.job_run_details.status`.
- **No backups exist.** Free tier, stated directly in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md)'s "Working directly against the
  live database" section -- a manual `supabase db dump` before any
  direct write is the only safety net. Worth knowing before treating any
  of the above as low-stakes to poke at.

## 6. Vercel (`growdy`, team `seth-schrage`, hobby plan)

- **Deployments** -- every push to `main` auto-deploys to production
  ([`docs/architecture.md`](architecture.md)); a failed build after a
  merge means `main` is now running *older* code with no separate
  alert. Check via `list_deployments` / the Vercel dashboard for
  `state != READY`, or `get_deployment_build_logs` for a specific one.
- **Runtime errors** -- `get_runtime_errors` (grouped error clusters,
  last up to 7 days). Clean as of 2026-09-17, zero in the trailing 7
  days -- but nothing currently checks this on any cadence.
- **Web analytics** -- available (`get_web_analytics`) but not reviewed
  here; likely not worth watching at current traffic.

## What's still genuinely unsolved

- The client-side `Chat.tsx:84` invoke failure (section 4) has no
  server-side echo at all -- fixing that for real means adding client
  error reporting (e.g. Sentry), a materially bigger, separate decision,
  not something to back into here.
- Nothing in sections 1-6 pushes a notification anywhere yet. Building
  that (an hourly check + email, the shape already discussed) is the
  natural next step once this list is the one both of us are checking
  against -- but it's a separate change from this document.
