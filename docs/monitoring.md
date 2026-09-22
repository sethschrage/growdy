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

Section 10 is the exception to all of that. It is not an inventory of
signals but of their absence: known, open weaknesses that no check
anywhere reports, and that stay invisible until somebody goes looking.
It is here because the three holes closed on 2026-09-21 were each found
by somebody looking rather than by anything running, and a hazard that
lives only in an audit transcript gets rediscovered instead of fixed.

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

The 👍/👎 buttons ([`app/src/features/chat/Chat.tsx:569-625`](../app/src/features/chat/Chat.tsx)) write
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
| [`chat/index.ts:1242`](../supabase/functions/chat/index.ts) | `chat crashed: ${err}` -- the whole request threw | n/a |
| [`_shared/supabaseClient.ts:60`](../supabase/functions/_shared/supabaseClient.ts) | `producer lookup failed, refusing the request: ...` -- a request to `chat`, `ingest-weather` or `add-weather-source` that did not resolve to a producer, answered 401. An expired token looks exactly like an anonymous probe from here; the only way to tell them apart is volume | n/a |
| [`chat/index.ts:1222`](../supabase/functions/chat/index.ts) | `chat stream crashed: ${err}` -- the request threw *after* the stream opened, so the producer sees a half-written answer stop | n/a |
| [`chat/index.ts:928,1049`](../supabase/functions/chat/index.ts) | Hit `MAX_TOOL_ITERATIONS` with no real answer -- producer silently gets "That took more searching than expected," not an error | n/a |
| [`chat/index.ts:175,249`](../supabase/functions/chat/index.ts) | The schema-description / data-channel-context setup queries failed -- the model then reasons with no description of the database at all | n/a |
| [`chat/index.ts:187`](../supabase/functions/chat/index.ts) | `NOT_DESCRIBED` names a relation that no longer exists ([0034](decisions/0034-a-schema-change-has-to-explain-itself.md)). CI fails on this too; the log covers a rename that reached production first | n/a |
| [`chat/index.ts:1005`](../supabase/functions/chat/index.ts) | One tool call threw. The model is handed the error text and usually recovers, so the producer may never see a problem | n/a |
| [`scan-conversations-for-observations/index.ts:138`](../supabase/functions/scan-conversations-for-observations/index.ts) | One conversation failed to classify/insert/mark-scanned | n/a |
| [`scan-conversations-for-observations/index.ts:106`](../supabase/functions/scan-conversations-for-observations/index.ts) | The whole batch's RPC call failed | n/a |
| [`ingest-weather/index.ts:77`](../supabase/functions/ingest-weather/index.ts) | The user-driven sync crashed *before* reaching `syncWeatherSourceChunk` (bad request, RLS-denied source, missing secret) | **No** -- distinct from the narrower `try/catch` inside `_shared/weatherIngest.ts:207-212` that does set `last_error` |
| [`app/src/data/chat.ts:24-42`](../app/src/data/chat.ts) | Nothing, now -- a failed call throws with the function's own message and the producer sees it in the chat. It used to `console.error` into the browser and stop there. | **No, and never can be** -- a total network failure calling the Edge Function never reaches any server-side log. Still a blind spot for anyone watching from the outside; the difference is that the producer is no longer the only one who notices *and* the only one who can't tell why. |

**A producer with no signal, which nothing here can see at all.** Every
signal in this document is server-side, and a phone in a block with no
bars never reaches the server. Until
[0037](decisions/0037-what-happens-with-no-signal.md) the app showed the
browser's own words for it and dropped the question; it now names the
situation and sends it when the connection returns. What is still
invisible from here: how often that happens, and whether a retry ever
landed. The only evidence is a producer saying so.

**A policy nothing could satisfy, for two days, silently.** `plot_rows`'
update policy called `private.user_can_edit_parcel`, which queries
`public.parcel_shares` --- a table
[0028](decisions/0028-what-uat-removed.md) dropped. Every attempt to
update a row's length, spacing or end-post count has failed with
"relation parcel_shares does not exist" since that migration. Nothing
reported it: the app rarely does it, and a broken policy reads as a
permissions error rather than a crash. Fixed in
[0036](decisions/0036-rls-predicates-are-evaluated-once.md). The general
lesson is that dropping a table does not fail the policies and functions
that reference it --- Postgres only notices when one runs --- so a
migration that drops a relation is worth a `grep` across
`supabase/migrations/` for the name.

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
description -- is 16,938 tokens as of 0.15.0 and is cached
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
  outside of that moment. Real findings -- the security advisors read
  live on 2026-09-21, the performance ones not re-read since 2026-09-17
  (re-check rather than trust this list): `pg_net` extension installed
  in `public` schema (should move to
  `extensions`); one `SECURITY DEFINER` function callable by `anon` --
  `rls_auto_enable`, which is not defined by any migration in this repo
  at all (`pg_get_functiondef` shows it owned by `postgres`, not the
  migration-applying role) -- it's Supabase's own platform-injected event
  trigger that auto-enables RLS on any new `public` table, a
  defense-in-depth default, not growdy's. Harmless if called directly
  outside its event-trigger context (`pg_event_trigger_ddl_commands()`
  only returns rows during a live DDL event), which is why the linter
  still flags it as anon-callable; six `SECURITY DEFINER` functions
  callable by `authenticated` (`add_data_source`,
  `confirm_observation_candidate`, `create_observation_candidate`,
  `create_producer_and_profile`, `get_decrypted_source_secret`, plus
  `rls_auto_enable` again) -- that lint describes the design rather than
  a defect here, because each of those five derives the producer from
  `auth.uid()` or checks `private.user_can_access_producer` before doing
  anything privileged, which is the whole reason they are `DEFINER` and
  not `INVOKER`; leaked-password protection disabled in
  Auth; 18 unused indexes (INFO-level, expected at this scale, not
  urgent). The second anon-callable function this list used to carry was
  growdy's own and deliberate -- `get_public_artifact`
  ([`0027`](decisions/0027-public-artifact-links.md)) -- and it went
  when the artifacts feature did.

  **This list is not coverage of grants, and cannot be made into it.**
  On 2026-09-21 seven `public` functions were found holding `EXECUTE`
  to PUBLIC, which means `anon`, because PostgREST publishes every
  executable `public` function at `/rest/v1/rpc/<name>`. One was
  `execute_readonly_query`, the chat's read tool, which takes a SQL
  string: called as `anon` it returned 21 rows out of
  `information_schema.tables`. RLS is why that disclosed the shape of
  the database rather than a producer's rows. The advisors were green
  the whole time those grants were live, across every release, and
  they were not malfunctioning: the
  `anon_security_definer_function_executable` lint fires on `SECURITY
  DEFINER`, and all seven were `SECURITY INVOKER`, so by construction
  the lint could not see a single one of them. "Check the advisors" --
  [`CONTRIBUTING.md`](../CONTRIBUTING.md)'s Migrations rule and
  Releases step 1 -- is a backstop for one shape of this mistake and
  was never a check on grants. Nothing in CI reads a `GRANT` either
  (section 10). Until something does, the moment a migration creates or
  replaces a function is the moment to read the ACL back by hand:

  ```sql
  select p.proname, p.prosecdef, p.proacl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proacl is null
          or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0));
  ```

  A null `proacl` means nobody has touched the grants, and the untouched
  default is `EXECUTE` to PUBLIC; grantee `0` is PUBLIC named outright.
  One row comes back today -- `rls_auto_enable`, which is Supabase's own
  and is described above. A second row is growdy's and wants a `revoke`.
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
- **Which Edge Functions accept an unauthenticated request, and what
  each one does before it finds out.** All six deploy with
  `verify_jwt: false` -- confirmed against the live project on
  2026-09-21, not assumed -- so the gateway checks nothing for any of
  them and each function's own first statement is the entire control.
  Two unrelated reasons, and it is worth not collapsing them: `chat`,
  `ingest-weather` and `add-weather-source` need it to answer their own
  CORS preflight (see
  [`supabase/functions/_shared/cors.ts`](../supabase/functions/_shared/cors.ts))
  and authorize with `resolveProducerId`; `sync-scheduled-weather`,
  `scan-conversations-for-observations` and `embed-scheduled-memory`
  need it because `pg_cron` is not a signed-in user, and authorize
  against a Vault-stored `X-Cron-Secret`
  ([0020](decisions/0020-scheduled-weather-sync.md)).

  Nothing watches this. The setting lives in the Supabase dashboard
  rather than in this repo, it is a deploy-time flag rather than
  anything a migration or CI can see, `supabase functions deploy`
  silently turns it back *on* for any function deployed without
  `--no-verify-jwt`, and the advisors above do not look at Edge
  Functions at all. `chat` spent from its first deploy until 2026-09-21
  calling Anthropic on this project's key for anyone who sent it a POST.
  The check that catches it is a `curl` with no credentials, per
  function, which is cheap:

  ```
  curl -sS -X POST https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/<name> \
    -H "content-type: application/json" -d '{}'
  ```

  A 401 is the right answer for all six. Anything else means the handler
  ran, and the question is what it did before it noticed. The flag
  itself reads back via the Supabase API (`list_edge_functions`), which
  is the only way to see it without deploying.
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

Confirmed 2026-09-19: `contexts: ["lint", "web"]`, `strict: false`, and
all three repo flags true. (`web` became required when the client got CI
of its own; before that a PR touching only `app/` was merged on the
strength of a schema check that never looked at it.)

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

## 10. Known hazards nothing watches

Open weaknesses with no check behind them. Each entry says what is
exposed and what is not, because "latent" and "live" deserve different
urgency and flattening them is how a real one gets lost among the
theoretical ones. All of these were verified against the live project on
2026-09-21 by querying `pg_proc`, `pg_class`, `pg_policy` and
`has_*_privilege` directly. Re-check before acting on one, and delete an
entry when it closes rather than leaving it to rot -- a stale hazard list
is read once and then never trusted again.

**Why this section exists.** Three unauthenticated-access holes were
found and closed on 2026-09-21, none of them by anything that runs on its
own. `create_observation_candidate` had grown a PUBLIC-executable
overload, because `create or replace function` with a changed argument
list creates a second function rather than replacing the first, and a new
function inherits Postgres's default grant instead of its predecessor's
ACL (#236, `20260921040000`). `chat`, `ingest-weather` and
`add-weather-source` reached Anthropic and the weather APIs on this
project's keys for callers holding no credentials at all, because
`verify_jwt: false` makes each function's own first statement the entire
control and `chat` had none from the day it shipped (#238). And seven
functions held `EXECUTE` to PUBLIC, `execute_readonly_query` among them
(#243, `20260921060000`; see section 6 for why no advisor could report
it). Three in one night, by three different routes, is a rate that says
the next one exists too.

- **The pg_cron trigger secrets pass through a table any signed-in
  caller can read.** Live, on a published schedule. `cron.job` ids 2/3/4
  build their `X-Cron-Secret` header from `vault.decrypted_secrets` and
  hand it to `net.http_post`, and pg_net stores the whole `headers`
  jsonb in `net.http_request_queue` until its background worker drains
  the row. `anon` and `authenticated` both hold `USAGE` on `net` and
  `SELECT` on `net.http_request_queue` and `net._http_response`, neither
  of which has RLS enabled -- confirmed live, not inferred. Anyone
  holding a session who polls the queue at the top of the hour captures
  `weather_sync_trigger_secret`, and at the six-hour marks the other
  two; holding one means being able to POST directly to
  `sync-scheduled-weather`, `scan-conversations-for-observations` or
  `embed-scheduled-memory`, which are the three `service_role` paths
  that read every producer's rows at once. **What bounds it today is
  that there is one producer**, so there is no second tenant to steal
  from. What is not bounded is the chat model: `execute_readonly_query`
  runs as `authenticated`, so a prompt injection arriving in a row, a
  memory chunk or a web result can ask for that header. The queue drains
  in about a second, so the window is narrow and it recurs on a
  timetable anyone can read. The real fix is getting the secret out of a
  pg_net header -- into the body, or replaced by a short-lived signed
  token -- not only revoking the `net` grants.
- **`web_fetch` has no domain allowlist, in the same tool loop that
  reads the whole database.** Live.
  [`chat/index.ts`](../supabase/functions/chat/index.ts)'s
  `WEB_FETCH_TOOL` and `WEB_SEARCH_TOOL` carry only `max_uses: 5`; no
  `allowed_domains`, no `blocked_domains`. The only thing between an
  injected instruction and egress is a sentence in the system prompt,
  which is an instruction to the model rather than a control. The
  model's untrusted inputs now include rows from any table, past
  conversation chunks, web search results and photo content, so any one
  of them carrying injected text is one hop from
  `web_fetch("https://…/?d=<data>")`. [`0024`](decisions/0024-web-access-as-a-provider.md)
  argued the cost case for always-on search and bounded it with
  `max_uses`; egress does not appear to have been considered.
- **`artifacts_deprecated` still has a live write path, and its drop
  migration has not been written.** Latent. The rename carried the
  table's grants, policies and `audit_row_change` trigger along with it,
  so `authenticated` holds `select`, `insert`, `delete` and `truncate`
  on a table nothing reads (`relacl` is `authenticated=ardDxtm`,
  confirmed live). `chat` hides it from the model's prompt, but
  `propose_write_query` takes free-form SQL, so the description is not
  the control. Two things are owed here and they are separate: revoke
  the write surface now, and write the drop migration that
  [`CONTRIBUTING.md`](../CONTRIBUTING.md)'s rename rule always intended
  to follow -- the rename buys a window to notice something still needed
  the table, and a window nobody is counting never closes. See
  [`docs/data-model.md`](data-model.md)'s note above the ER diagram.
- **`anon` holds `TRUNCATE` on all nineteen public tables.** Latent, not
  live, and worth stating in that order. Supabase's default `grant all`
  at project creation left every `public` table reading `anon=Dxtm` --
  `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN` -- and no migration
  ever revoked it; the migration that added the real grants
  (`20260913054119`) only added. `TRUNCATE` is the one that matters,
  because RLS does not apply to it and `audit_row_change` is a row-level
  trigger, so a truncate arriving as `anon` would empty a table
  regardless of tenancy and record nothing. No reachable path exists
  today: PostgREST has no TRUNCATE verb, `execute_readonly_query` blocks
  it with `transaction_read_only`, and `propose_write_query` wraps the
  statement in `with t as (%s returning *)`, which TRUNCATE will not
  parse. Exactly one `anon` table grant in this schema is deliberate,
  `select` on `app_status` ([0017](decisions/0017-app-status-forces-refresh.md)).
- **The `observations` SELECT policy still carries the parcel-sharing
  branch, and parcel sharing is gone.** Latent. The live predicate is
  `producer_id = (select private.current_producer_id())` **or**
  `planting_id in (…plantings under one of my parcels…)`. That second
  branch was added for sharing by `20260916185426_parcel_sharing.sql`;
  [0028](decisions/0028-what-uat-removed.md) removed the feature and
  stripped the branch out of `private.user_can_access_parcel` but not out
  of here, and
  [0036](decisions/0036-rls-predicates-are-evaluated-once.md) then
  rewrote the policy mechanically and carried the dead branch forward.
  `observations` is now the one producer table whose read rule is not
  "`producer_id` is the tenancy key" -- the DELETE policy beside it
  already is. Not exploitable today, because
  `create_observation_candidate` sets `producer_id` from `auth.uid()` and
  `confirm_observation_candidate` copies it, so the two columns always
  agree. It becomes a cross-tenant read the day they can disagree, which
  is the day [0028](decisions/0028-what-uat-removed.md)'s "the parcel is
  the seat" gets built.
- **Nothing in CI reads a `GRANT`, and the RLS checker only looks at one
  schema.** Not an exposure; the gap that lets the others last.
  [`scripts/check-rls-shape.mjs`](../scripts/check-rls-shape.mjs) scopes
  its query to `nspname = 'public'`, and the three policies currently in
  the per-row-helper shape it exists to reject are on `storage.objects`
  (`private.user_can_access_producer(private.storage_object_producer(name))`,
  evaluated per row), invisible because of that one line. More
  consequential is what no checker looks at at all: whether RLS is on,
  whether a table has any policy, whether a policy's role list is
  `{public}`, and the table and function grants. Grants are the layer
  Postgres evaluates *before* RLS, and this repo has now shipped five
  migrations whose entire job was taking back a grant wider than
  anyone intended: `20260915035815` (PUBLIC `EXECUTE` on the vault
  helpers), `20260916175824` and then `20260916192106` -- two, because
  the first `revoke` silently did nothing, having named a column
  privilege that was never separately granted -- and `20260921040000`
  and `20260921060000` from tonight. A rule rediscovered four times
  and still not mechanically enforced is the schema-level version of
  what [`CONTRIBUTING.md`](../CONTRIBUTING.md) says about process rules:
  it stops being followed without anyone deciding to drop it. The check
  is small and runs on the same local stack `check-rls-shape.mjs`
  already uses -- fail on any `public` function with `EXECUTE` to
  PUBLIC, and on any `public` table privilege held by `anon` outside an
  explicit allowlist.
- **`createAdminClient` reads a legacy env var, and the legacy key is
  still enabled.** An availability trap rather than an exposure, and the
  trap is the point.
  [`_shared/supabaseClient.ts`](../supabase/functions/_shared/supabaseClient.ts)
  reads the new-style `SUPABASE_PUBLISHABLE_KEYS` on one line and the
  legacy `SUPABASE_SERVICE_ROLE_KEY` fifteen lines later, so one
  thirty-line file straddles both key systems. The project also still has
  the legacy `anon` JWT enabled alongside `sb_publishable_…`: two working
  anonymous credentials. Disabling legacy keys -- the right move, and one
  somebody will reach for before a native client ships -- takes all three
  scheduled jobs down **silently**, because `createClient(url, undefined)`
  throws inside the handler, `cron.job_run_details` still reads
  `succeeded`, and the only evidence lands in `net._http_response.content`.
  That is precisely the fire-and-forget trap section 5 already documents,
  waiting on a routine piece of housekeeping to spring it. Move
  `createAdminClient` onto `SUPABASE_SECRET_KEYS` *first*, then disable
  the legacy key. [`0020`](decisions/0020-scheduled-weather-sync.md):17
  describes neither accurately -- it says the admin client already builds
  from `SUPABASE_SECRET_KEYS`, and that `sync-scheduled-weather` is the
  only `service_role` user, which stopped being true when
  `scan-conversations-for-observations` and `embed-scheduled-memory`
  shipped.

### `authenticated` held TRUNCATE on every table (closed 2026-09-21)

`20260921090000` took `TRUNCATE`, `REFERENCES` and `TRIGGER` away from
`anon`, which left it holding exactly one privilege in `public`: `SELECT`
on `app_status`. **The same platform default is still in place for
`authenticated`**, verified after that migration: it holds `TRUNCATE` on
every table in the schema.

RLS does not apply to `TRUNCATE`, and `audit_row_change` is a row-level
trigger, so a truncate would empty a table and record nothing.

It is latent for the same three reasons `anon`'s was: PostgREST has no
`TRUNCATE` verb, `execute_readonly_query` runs read-only, and
`propose_write_query` wraps what it is given in
`with t as (%s returning *)`, where `TRUNCATE` does not parse. None of
those was put there for this reason.

**Closed by `20260921100000`**, which revokes exactly those three and
nothing else. Verified in a rolled-back transaction first and re-read
afterwards: zero dangerous grants remain, and every deliberate grant the
policies assume -- `conversations` INSERT/UPDATE, `data_sources`
UPDATE/DELETE, `weather_observations` INSERT/UPDATE, `pending_writes` and
`producer_memory` INSERT, `observations` DELETE -- still answers true.
`scripts/check-anon-reach.mjs`'s baseline went 60 to 0 with it, so the
board fails if any of this comes back.

What is left of the original note is why it waited, which is still the
useful part:

It was not fixed alongside `anon` because the two are not the same job.
`anon` needed exactly one grant kept and the rest could go in one line.
`authenticated` is the role the whole app runs as: every policy assumes a
specific set of `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants per table, and
a blanket `revoke all` would take those with it. Doing it safely means
enumerating what each table actually needs and re-granting it, which is a
migration to write carefully rather than at the end of a long night.

The narrow version -- `revoke truncate, references, trigger on all tables
in schema public from authenticated` -- touches nothing the app uses, and
is what shipped. The wider question it was distinguished from is still
open and still deliberate: `authenticated` holds SELECT on every table in
the schema, which RLS makes safe and which nobody has enumerated against
what the client actually reads.

### Two storage policies are in the shape 0036 banned (open, performance)

`scripts/check-rls-shape.mjs` reads `nspname = 'public'` only, so it has
never looked at `storage`. Two live policies there are in exactly the
shape it exists to catch:

- `storage.objects` / "observation photos: read own producer's"
- `storage.objects` / "observation photos: delete own producer's"

Both are
`private.user_can_access_producer(private.storage_object_producer(name))`
--- a `SECURITY DEFINER` call taking a value derived from the row, so it
runs once per object in the bucket rather than once per statement. That
is [`0036`](decisions/0036-rls-predicates-are-evaluated-once.md)'s whole
subject, and the reason it matters is the same: it is free at four photos
and it is a timeout at forty thousand.

Not fixed alongside the `public` policies because rewriting these changes
who can read a photo, and that wants testing against a real upload and
download rather than a green checker. The checker was not widened either
--- doing that without fixing them would just paint the board red.

The corrected shape is the same one every other policy now uses:
`private.storage_object_producer(name) = (select private.current_producer_id())`.
