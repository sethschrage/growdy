# Monitoring

Every place in the system that needs a human to look at it, and every
place a real failure currently ends up. This is the inventory
[`0019`](decisions/0019-external-data-channels.md) named directly but
deferred: *"alerts (unprompted, pushed notification) [are] a distinct
future direction, gated on a real missed incident, not something to
build a piece of speculatively here."* Sections 1-8 are that inventory --
every signal is still a pull you can run by hand, and stays accurate on
its own regardless of whether anything is watching it automatically.
Section 9 documents the piece built on top of it: a live dashboard and a
scheduled check that reads sections 1-7 and pushes a notification when
something changes. It lives outside this repo entirely (see section 9
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

`observations` used to be a fourth, and the worst of them: its `status`
column defaulted to `pending` with nothing anywhere able to approve a
row. [0028](decisions/0028-what-uat-removed.md) removed the column
rather than build the approver -- an observation now counts the moment
it is logged, and a producer deletes what they don't want. There is
nothing left to watch here, which is the point.

| Table | Column | Values | Who resolves it, how |
|---|---|---|---|
| `observation_candidates` | `status` | `pending` (default) / `confirmed` / `dismissed` | The producer, in-app. **Now fed by every path, not just the 6-hourly `scan-conversations-for-observations` job** -- a typed note, a photo, the chat's write tool and the scanner all file candidates, and nothing reaches `observations` any other way ([0030](decisions/0030-every-observation-through-one-queue.md)). The cost of an unworked queue went up accordingly: it used to mean a missed suggestion, and now means a field note the producer believes they filed. |
| `plant_types` | `status` | `pending` (default) / `canonical` / `rejected` | **Nobody, via any UI either.** [`20260913003426_plant_types.sql:20-22`](../supabase/migrations/20260913003426_plant_types.sql) -- any producer typing a new variety/scion/rootstock name implicitly proposes one; a maintainer promotes it to `canonical` (visible to everyone) with a plain `UPDATE`, "no automated/self-service promotion exists yet." |
| `pending_writes` | `status` | `pending` (default) / `applied` / `declined` | The producer, in the same chat session, by clicking confirm/decline on a chat-drafted write ([`20260916173224_write_tool_audit_and_rollback.sql:17-24`](../supabase/migrations/20260916173224_write_tool_audit_and_rollback.sql)). A row stuck `pending` well past a normal session length (minutes, not hours) means the confirm/decline path itself broke, not that a producer is still deciding. |

Check counts any time with:

```sql
select 'observation_candidates pending' as signal, count(*) from public.observation_candidates where status = 'pending'
union all select 'plant_types pending', count(*) from public.plant_types where status = 'pending'
union all select 'pending_writes stuck', count(*) from public.pending_writes where status = 'pending' and created_at < now() - interval '1 hour';
```

## 2. Chat feedback -- not a table, a jsonb search

The 👍/👎 buttons ([`app/src/features/chat/Chat.tsx:319-378`](../app/src/features/chat/Chat.tsx)) write
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
([`app/src/data/conversations.ts:48-57`](../app/src/data/conversations.ts)),
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

## 4. Embedding pipeline health -- resolved, and worth keeping the meter

**Resolved 2026-09-18 by adding a payment method to the Voyage/MongoDB
account.** It cost nothing: the free-trial throttle (3 RPM / 10K TPM) is
a rate limit, not a paywall, and the 200M free token grant still applies
after a card is added. The whole conversation corpus is ~29K tokens,
0.015% of that grant.

[`0023`](decisions/0023-producer-memory-via-embeddings.md)'s Consequences
had named the throttle, and `embed-producer-memory-6h` had no way to
signal it anywhere a human would see -- the same fire-and-forget shape as
the other scheduled jobs in section 6. The meter below is what surfaced
it, and is worth keeping now that the limit is gone, since the job still
cannot report a failure on its own:

```sql
select
  count(*) filter (where embedded_at is null or updated_at > embedded_at) as pending,
  count(*) as total,
  round(100.0 * count(*) filter (where embedded_at is not null and updated_at <= embedded_at) / nullif(count(*), 0), 0) as pct_embedded
from public.conversations;
```

**Now 100% embedded (47 of 47, 0 pending).** Before the payment method
it read 20% (33 of 41 pending), and a single run embedded 3 conversations
before 17 more hit `Voyage embeddings API error (429)` carrying the
"you have not yet added your payment method" detail. After it, two manual
runs returned `embeddedConversations: 20` and `8` with `errors: []`. The
response body is where that shows -- same "don't trust `status =
'succeeded'`" trap as section 6:

```sql
select content from net._http_response
where content like '%embeddedConversations%'
order by created desc limit 1;
```

This query is the "meter." It's now also its own card on section 9's
dashboard (`embedding_pipeline`, split out of `background_jobs`) rather
than something a maintainer has to come pull by hand -- the query above
is what that card's own check runs, and it's still exactly what to run
here if the dashboard itself is ever unreachable. Unembedded rows retry next run either way, so
a backlog is never lost -- but before the fix it drained at roughly 3 per
6-hourly run against new conversations arriving, which is why it sat near
20% for days. Worth re-checking if it ever stops draining again: the
error detail in the response body names the cause, and MongoDB offers no
hard spend cap, only project-level rate limits and billing alerts.

## 5. Failures that are logged, but nowhere anyone looks

This is the category the database signals above don't cover at all:
every Edge Function catches its own crashes and calls `console.error`,
which reaches Supabase's platform log stream and *only* that -- never a
table, never anything polled. Real call sites:

| File:line | What it logs | Reaches `data_sources.last_error`? |
|---|---|---|
| [`chat/index.ts:1157`](../supabase/functions/chat/index.ts) | `chat crashed: ${err}` -- the whole request threw | n/a |
| [`chat/index.ts:1137`](../supabase/functions/chat/index.ts) | `chat stream crashed: ${err}` -- the request threw *after* the stream opened, so the producer sees a half-written answer stop | n/a |
| [`chat/index.ts:881,978`](../supabase/functions/chat/index.ts) | Hit `MAX_TOOL_ITERATIONS` with no real answer -- producer silently gets "That took more searching than expected," not an error | n/a |
| [`chat/index.ts:171,245`](../supabase/functions/chat/index.ts) | The schema-description / data-channel-context setup queries failed -- the model then reasons with no description of the database at all | n/a |
| [`chat/index.ts:183`](../supabase/functions/chat/index.ts) | `NOT_DESCRIBED` names a relation that no longer exists ([0034](decisions/0034-a-schema-change-has-to-explain-itself.md)). CI fails on this too; the log covers a rename that reached production first | n/a |
| [`chat/index.ts:934`](../supabase/functions/chat/index.ts) | One tool call threw. The model is handed the error text and usually recovers, so the producer may never see a problem | n/a |
| [`scan-conversations-for-observations/index.ts:130`](../supabase/functions/scan-conversations-for-observations/index.ts) | One conversation failed to classify/insert/mark-scanned | n/a |
| [`scan-conversations-for-observations/index.ts:98`](../supabase/functions/scan-conversations-for-observations/index.ts) | The whole batch's RPC call failed | n/a |
| [`ingest-weather/index.ts:64`](../supabase/functions/ingest-weather/index.ts) | The user-driven sync crashed *before* reaching `syncWeatherSourceChunk` (bad request, RLS-denied source, missing secret) | **No** -- distinct from the narrower `try/catch` inside `_shared/weatherIngest.ts:207-212` that does set `last_error` |
| [`app/src/data/chat.ts:24-42`](../app/src/data/chat.ts) | Nothing, now -- a failed call throws with the function's own message and the producer sees it in the chat. It used to `console.error` into the browser and stop there. | **No, and never can be** -- a total network failure calling the Edge Function never reaches any server-side log. Still a blind spot for anyone watching from the outside; the difference is that the producer is no longer the only one who notices *and* the only one who can't tell why. |

**The one that logs nothing at all: an answer the client cannot read.**
Everything above is a failure that reaches a log. This one does not. On
2026-09-19 the iOS shell rejected a streamed reply with a bare `Load
failed`; server-side, the request was a `POST | 200`, the model ran, and
`chat usage: in=79 out=182 cacheRead=0 cacheWrite=16938` was logged like
any other healthy turn. Every signal in this document said the chat was
fine. The producer had an error on screen and no answer.

It was intermittent, which is the other half of why it logs nothing
useful: twenty minutes later the same shell streamed the same kind of
request without trouble, and the logs for the two are indistinguishable.
Counting requests is the one signal that does distinguish them -- a
fallback shows up as two `POST`s about a second apart for one question,
where two questions are fifteen seconds apart.

The client now falls back to a buffered request when a streamed one
fails, so this fault produces a slower answer instead of no answer. The
general shape stays: **a complete `chat usage` line means the model
answered, not that anybody received it.** The only check for that is
using the app, which is why it is now a step in the release process
rather than a habit.

**The prompt cache, which fails by getting quietly expensive.** The
chat's system prompt -- instructions, tool definitions, schema
description -- is on the order of fifteen thousand tokens and is cached
([0033](decisions/0033-what-goes-in-the-cached-prompt.md)). The exact
figure moves whenever the schema does, since the description is
generated from the catalog
([0034](decisions/0034-a-schema-change-has-to-explain-itself.md)), so
the number to watch is not its value but whether `cacheRead` tracks it.
Caching is content-addressed, so anything that makes that text vary per
request turns every call into a miss *and* charges the write premium,
which is worse than not caching. Nothing errors; the bill just goes up. Every
model turn logs its own numbers:

```
chat usage: in=565 out=114 cacheRead=15240 cacheWrite=0
```

`cacheRead` at 0 on the second turn of a conversation is the signal
something in the prefix has become volatile. Check it after any change
that touches the system prompt or the queries that build it:

```sql
-- Function logs, last hour, via the dashboard or the logs API:
-- source = function_logs, event_message like '%chat usage%'
```

**Two things about photos that fail by being absent** rather than by
erroring, both worth knowing before trusting a map built on them:

- **An abandoned photo stays in the bucket.** The upload happens when a
  photo is attached, not when the message is sent, so a producer who
  attaches and then backs out leaves an object behind unless they use
  the remove button (which deletes it). Nothing sweeps them, and
  nothing counts them. `select count(*) from storage.objects where
  bucket_id = 'observation-photos'` against the number of rows holding a
  path is the only check there is.
- **A photo with no location looks exactly like a bug that drops it.**
  This is not hypothetical: `nativeExif` looked for a flat `GPSLatitude`
  that iOS never sends, and every photo uploaded without its position
  for as long as the feature existed, silently, because a photo without
  GPS is completely ordinary (#195). If GPS coverage matters, check it
  as a rate -- `photo_location is not null` against photos attached --
  rather than trusting that any individual missing point means the
  camera had no fix.

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

## 8. GitHub repo settings -- silent, and nothing watches them

Unlike everything above, this section has no signal at all: a wrong
setting here produces no log line, no error and no failed check. It
surfaces as work quietly not happening. The dashboard in section 9 does
not cover it; the only check is the command below.

**Auto-merge depends on a *required* status check, not just a passing
one.** [`CONTRIBUTING.md`](../CONTRIBUTING.md) has auto-merge on for
every PR, which relies on GitHub seeing a PR as genuinely
blocked-pending-checks. With no check marked *required* on `main`,
GitHub treats a running check as merely "unstable" and enabling
auto-merge fails two different ways depending on timing -- `Pull request
is in unstable status` while CI runs, `Pull request is in clean status`
once it passes. Neither message names the cause. `lint` was made a
required check on `main` to fix it (Settings -> Branches -> edit the
`main` rule -> "Require status checks to pass before merging"), with
"Require branches to be up to date" left off deliberately, since strict
mode forces a rebase on every PR whenever `main` moves.

Verify current state -- `contexts` must be non-empty:

```
gh api repos/sethschrage/growdy/branches/main/protection/required_status_checks
gh api repos/sethschrage/growdy --jq '{allow_auto_merge, allow_squash_merge, delete_branch_on_merge}'
```

Confirmed 2026-09-18: `contexts: ["lint"]`, `strict: false`, and all
three repo flags true.

**A `clean status` refusal is not always a bug.** If CI has already
finished and passed, there is nothing left for auto-merge to wait on and
GitHub declines it correctly -- merge directly instead. The failure
worth investigating is the same message appearing *while* checks are
still running, which means the required check has gone missing again.

## 9. The live dashboard and scheduled check -- and where it actually lives

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
  `pending_candidates` / `pending_plant_types`
  / `stuck_writes` / `chat_feedback` / `data_sources` / `background_jobs`
  / `embedding_pipeline` / `function_errors` / `supabase_advisors` /
  `vercel` -- matching sections 1, 2, 3, 4, 6, and 7 above
  (`background_jobs` still covers the scan-conversations trap in
  section 5; `embedding_pipeline` was split out of it on 2026-09-17 as
  its own card, see below; `pending_observations` was retired when 0028
  removed the column behind it). Each: `{status:
  "ok"|"attention"|"critical", count, summary, items: [{label, detail,
  timestamp}], checked_at}`.
- `meta/summary`: `{overall, attention_categories, checked_at}`, drives
  the dashboard's header pill.
- `meta/alert_state`: `{last_notified_signature, last_notified_at}`,
  the notification dedup state described above.

**To add a new signal**, following exactly how `embedding_pipeline`
itself was added on 2026-09-17 (splitting the section 4 backlog out of
`background_jobs` into its own card): decide its status rubric first,
matching the `ok`/`attention`/`critical` shape the others use; add the
check and the corresponding write to the Routine's prompt with
`RemoteTrigger action: "update"` (a partial update -- fetch the current
prompt with `action: "get"` first and edit it, don't reconstruct it from
scratch); add a matching entry to the `CATEGORIES` array in
[`ops/growdy-watch/index.html`](../ops/growdy-watch/index.html) (same
`{group, id, label, hint}` shape as its neighbors); republish that file
with the `Artifact` tool against the dashboard's URL (`capabilities`
carries forward automatically -- no need to redeclare `db`); then
`RemoteTrigger action: "run"` the Routine once by hand so the new
category has real data instead of sitting on "No data yet" until the
next scheduled run.

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
