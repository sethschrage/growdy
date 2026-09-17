# Monitoring

Every place in the system that needs a human to look at it, and every
place a real failure currently ends up. This is the inventory
[`0019`](decisions/0019-external-data-channels.md) named directly but
deferred: *"alerts (unprompted, pushed notification) [are] a distinct
future direction, gated on a real missed incident, not something to
build a piece of speculatively here."* Sections 1-7 are that inventory --
every signal is still a pull you can run by hand, and stays accurate on
its own regardless of whether anything is watching it automatically.
Section 8 documents the piece built on top of it: a live dashboard and a
scheduled check that reads sections 1-7 and pushes a notification when
something changes. It lives outside this repo entirely (see section 8
for exactly where and why) -- this document is still the one place that
explains what each signal *means*.

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

## 4. Embedding pipeline health -- a real, currently-active rate limit

[`0023`](decisions/0023-producer-memory-via-embeddings.md)'s own
Consequences already named this: Voyage/MongoDB's free trial throttles to
3 RPM / 10K TPM until a payment method is added, and `embed-producer-memory-6h`
(every 6 hours) has no way to signal that anywhere a human would see it --
same fire-and-forget shape as the other scheduled jobs in section 6, and
until now, no query anyone would think to run either. This is that
query, and the meter it gives you:

```sql
select
  count(*) filter (where embedded_at is null or updated_at > embedded_at) as pending,
  count(*) as total,
  round(100.0 * count(*) filter (where embedded_at is not null and updated_at <= embedded_at) / nullif(count(*), 0), 0) as pct_embedded
from public.conversations;
```

Live right now, confirmed while writing this: **20% embedded (33 of 41
conversations still pending)**, and the most recent run's own response
body (`net._http_response.content`, same "don't trust `status =
'succeeded'`" trap as section 6) shows exactly why -- 3 conversations
embedded, 17 more hit `Voyage embeddings API error (429)` with the
same "you have not yet added your payment method" detail, in the same
single run:

```sql
select content from net._http_response
where content like '%embeddedConversations%'
order by created desc limit 1;
```

Nothing here pushes any more than the rest of this document does -- this
is the "meter" asked for, not an alert. It's a percentage a maintainer
has to go pull, not one that shows up anywhere on its own; an actual
gauge rendered somewhere (a maintainer view doesn't exist in the app at
all yet, per the intro above) would be new UI, not documentation, and is
a separate, bigger decision than adding a query here. Harmless either
way today -- unembedded rows just retry next run -- but the backlog
won't meaningfully shrink until a payment method is added to the
Voyage/MongoDB account, and this is how to see that it hasn't been
without waiting for a producer to notice `search_memory` coming up
empty on something recent.

## 5. Failures that are logged, but nowhere anyone looks

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
`20260917020100_scan_conversations_service_role_grants.sql` --
**incompletely**: the very next scheduled run still failed on every
conversation with the identical error, because `UPDATE` alone doesn't
cover it -- Postgres also needs `SELECT` to evaluate the `WHERE id =
...` clause the update runs against, which the sibling weather-table
migration had granted alongside `update` and this one didn't. Actually
fixed in `20260917030100_conversations_service_role_select_grant.sql`,
confirmed by re-checking `net._http_response.content` on the run after
that landed. The lesson generalizes: a `grant update` on any table a
policy-bypassing role writes through a `WHERE`-scoped statement needs
`select` alongside it, every time, not just when the linter happens to
catch it.

## 6. Supabase platform-level

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
  start_time desc` for the *three* scheduled jobs
  (`sync-weather-sources-hourly`, `scan-conversations-for-observations-6h`,
  `embed-producer-memory-6h`), but see the fire-and-forget trap in
  section 5 -- always cross-check `net._http_response.content` too, not
  just `cron.job_run_details.status` (section 4 is a live example of
  exactly that, for the newest of the three: `embed-producer-memory-6h`
  reads `succeeded` while its own body shows `Voyage embeddings API
  error (429): ... no payment method on file ...` on most entries -- a
  Voyage AI billing gap, not a growdy bug).
- **No backups exist.** Free tier, stated directly in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md)'s "Working directly against the
  live database" section -- a manual `supabase db dump` before any
  direct write is the only safety net. Worth knowing before treating any
  of the above as low-stakes to poke at.

## 7. Vercel (`growdy`, team `seth-schrage`, hobby plan)

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

## 8. The live dashboard and scheduled check -- and where it actually lives

Sections 1-7 now feed an actual running system, built 2026-09-17. Read
this section before touching it -- it does **not** live in this repo,
in Supabase, or in Vercel, which makes it invisible to anyone who only
knows to look at [`docs/architecture.md`](architecture.md)'s three
deploy paths.

**Where each piece is:**

- **Dashboard**: a private Claude Artifact, "Growdy Watch" --
  <https://claude.ai/artifact/JVv4C3biUWkPKXruZg88x1>. Requires being
  signed in as its owner (Seth's claude.ai account) to open; the link
  alone grants nothing. Its HTML source is committed at
  [`ops/growdy-watch/index.html`](../ops/growdy-watch/index.html) *for
  reference and editing* -- that copy is inert on its own (no build
  step publishes it anywhere); the live page only updates when someone
  republishes it with the `Artifact` tool against that same URL. Treat
  the repo copy as the source of truth to edit, and the live URL as the
  deploy target, same mental model as everything else here, just a
  different tool than `git push`.
- **The check itself**: a Claude Code Remote Routine (a scheduled
  trigger, not a Supabase Edge Function or GitHub Action), named
  "Growdy Watch hourly check" (the name predates moving it to daily --
  not worth a cosmetic rename), `trigger_id trig_011dPXbSXhcmAabuPCTCFYQe`,
  currently daily at 12:17 UTC. It fires by **resuming one specific
  persistent Claude Code session**
  (`session_01Xmz8sEKEeuFe8G5WtgL7NM`) rather than spawning a fresh one
  -- a fresh-session Routine was tried first and silently failed to
  complete (burned real tokens, never wrote the dashboard) for reasons
  never fully root-caused, most likely losing access to the
  Supabase/Vercel MCP tools this session already has configured. **This
  is the system's real fragility**: if that specific session is ever
  archived or deleted, the Routine will fire into a dead target with no
  documented fallback, and nothing in this repo would tell you why the
  dashboard stopped updating -- you'd have to know to check
  `list_triggers`/`get_session` on the Claude Code Remote account that
  owns it. Whoever owns this system should notice if the dashboard's
  `checked_at` stops advancing.
- **Notifications**: `PushNotification` (phone via Remote Control, or
  the terminal) only, no email. Dedup lives in the dashboard's own data
  store (`meta/alert_state.last_notified_signature`), not in the
  Routine's prompt -- it only re-notifies when the *set* of non-ok
  categories changes, not on every run something stays broken.

**The data schema** (all in the dashboard artifact's own `db`
capability, a JSON document store separate from `growdybase` entirely):

- Collection `checks`, one document per signal, ids
  `pending_observations` / `pending_candidates` / `pending_plant_types`
  / `stuck_writes` / `chat_feedback` / `data_sources` / `background_jobs`
  / `function_errors` / `supabase_advisors` / `vercel` -- matching
  sections 1, 2, 3, 6, and 7 above (`background_jobs` covers both the
  scan-conversations trap in section 5 and the embedding-pipeline
  failures in section 4; there's no separate `embedding_pipeline` card
  yet -- see "to add a new signal" below if that's worth splitting out).
  Each: `{status: "ok"|"attention"|"critical", count, summary, items:
  [{label, detail, timestamp}], checked_at}`.
- `meta/summary`: `{overall, attention_categories, checked_at}`, drives
  the dashboard's header pill.
- `meta/alert_state`: `{last_notified_signature, last_notified_at}`,
  the notification dedup state described above.

**To add a new signal** (say, splitting the embedding-pipeline backlog
in section 4 into its own card instead of folding it into
`background_jobs`): decide its status rubric first, matching the
`ok`/`attention`/`critical` shape the others use; add the check and the
corresponding write to the Routine's prompt with `update_trigger` (send
schedule and prompt changes as separate calls, per that tool's own
guidance); add a matching entry to the `CATEGORIES` array in
[`ops/growdy-watch/index.html`](../ops/growdy-watch/index.html) (same
`{group, id, label, hint}` shape as its neighbors); republish that file
with the `Artifact` tool against the dashboard's URL (`capabilities`
carries forward automatically -- no need to redeclare `db`); then
`fire_trigger` the Routine once by hand so the new category has real
data instead of sitting on "No data yet" until the next scheduled run.

**Also still genuinely unsolved:**

- The client-side `Chat.tsx:84` invoke failure (section 5) has no
  server-side echo at all -- fixing that for real means adding client
  error reporting (e.g. Sentry), a materially bigger, separate decision,
  not something to back into here.
- Supabase advisors and Vercel deploy/runtime errors (sections 6-7) are
  checked by the Routine reading them live each run -- there's no
  cheaper way to watch either that doesn't also need this same
  Claude-Code-Remote-hosted approach, since neither is something a
  Supabase Edge Function or GitHub Action can reach on its own without
  a materially bigger credential (a Supabase Management API token, a
  Vercel API token) than anything else this project holds.
