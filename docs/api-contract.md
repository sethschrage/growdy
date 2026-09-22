# The API contract

**Status:** live. Changes here are changes to what two clients depend on.

## Why this file exists

[`0038`](decisions/0038-the-phone-gets-its-own-client.md) decided the phone
gets a native SwiftUI client and named the debt this creates in the same
breath: *"The API contract has to be written down, and currently is not.
`app/src/data/` has been the only specification of what the Edge Functions
accept and return --- the SSE event types the chat streams, the RPC
signatures, the error shapes. One client can get away with that because the
client *is* the spec. Two cannot."*

This is that spec. It is written from the code rather than from intent, and
where the code and a comment disagree the code is recorded. It covers 51
network calls across six surfaces.

**It is not a tutorial and not a wish list.** Everything here is what the
backend does today. Where the React client does something the contract does
not require --- a retry, a cache, a defaulted field --- that is called out
as client behaviour, because a second client that silently drops it is a
regression and a second client that silently copies it may be preserving a
workaround.

---

## 1. Cross-cutting

**Base URL.** `https://fostmbhpnhjzhulphxzp.supabase.co`. Edge Functions sit
under `/functions/v1/<name>`, PostgREST under `/rest/v1/`, storage under
`/storage/v1/`, auth under `/auth/v1/`.

**Two keys, different jobs.** The publishable key identifies the *project*
and is safe to ship in a client; the session access token identifies the
*user*. PostgREST wants both --- `apikey` and `Authorization` --- and the
Edge Functions read only `Authorization`.

**Authorization is the whole access model.** `verify_jwt` is `false` on all
six Edge Functions, deliberately, so each can answer its own CORS preflight.
That means the Supabase gateway checks nothing and each function
self-authorizes. Every browser-facing function does the same three things
before it spends money: answer `OPTIONS`, resolve a producer, then work. The
resolve is a `select producer_id from profiles` with no `.eq()` --- RLS's
`id = auth.uid()` makes the row necessarily the caller's, and `anon` holds no
grant on `profiles` at all, so a missing or expired token produces a
permission error rather than an empty set. Both outcomes return `null`, and
`null` means 401.

Nothing uses the service-role key. Every read the chat performs on the
producer's behalf runs under the caller's own forwarded JWT, so **RLS decides
what the model can see, not the function**.

**Reads retry themselves. Writes do not.** This is the single easiest thing
to lose in a rewrite. `postgrest-js` wraps every REST call in
`fetchWithRetry`: up to 3 attempts, `RETRYABLE_METHODS = ['GET','HEAD','OPTIONS']`,
`RETRYABLE_STATUS_CODES = [520, 503]`, honouring `Retry-After` and otherwise
backing off 1s/2s/4s, never retrying an aborted request. It is on by default
and nothing in growdy turns it off. So today every read survives three
transient failures invisibly and **no write or RPC gets a second attempt** ---
`confirm_write`, `create_observation_candidate`, every PATCH and DELETE are
single-shot.

A native client written from the endpoint list alone would have no retry
anywhere, which is a real regression for a vineyard with one bar of signal.
It should reproduce the read-side retry. It should **not** add retry to the
write side to compensate: the writes are single-shot because they are not all
idempotent, and the one that is (`create_observation_candidate`) gets its
idempotency from `client_id` instead (§7).

**Headers `supabase-js` always sends**, easy to omit by hand: `Accept-Profile: public`
on GET/HEAD, `Content-Profile: public` on everything else, and
`Content-Type: application/json` on every non-GET/HEAD *including DELETE*.

**`.single()` and `.maybeSingle()` are not the same request.** `.single()`
sends `Accept: application/vnd.pgrst.object+json` and lets PostgREST enforce
cardinality. `.maybeSingle()` sends no Accept override and enforces it
client-side. Reproduce the asymmetry, or a zero-row `.maybeSingle()` becomes
an error instead of a `nil`.

**`max_rows = 1000`**, set in `supabase/config.toml`. PostgREST **silently
truncates** at that count rather than erroring, so a list that comes back with
exactly 1000 rows is a list that may have more. Nothing in the client handles
this today because nothing is near it; a native client building a map layer
over plantings will get there first.

**Ids and dates.** Client-minted UUIDs appear in three places: the
conversation id, the queue's `clientId`, and the storage object name. Swift's
`UUID()` is a drop-in with one trap --- `UUID.uuidString` is **uppercase**,
and while the storage policy's cast to `uuid` accepts either case, the paths
will not match existing ones byte for byte. Lowercase them. Dates on the wire
are `YYYY-MM-DD`, and `exifObservedDate` formats from the device's *local*
calendar, not UTC: use `Calendar.current`, never an ISO8601 formatter, or
a photo taken at 11pm files itself to tomorrow.

---

## 2. `POST /functions/v1/chat` --- the one that streams

The centrepiece, and the only endpoint where getting the contract slightly
wrong produces something that looks like it works.

**Request.** Headers: `content-type: application/json`,
`authorization: Bearer <access_token>`, `apikey: <publishable key>`, and
`accept`. Body:

```json
{
  "messages": [{ "role": "user" | "assistant", "content": "..." }],
  "photoPath": "<producer_id>/<uuid>.jpg",
  "photoTakenOn": "YYYY-MM-DD"
}
```

`photoPath` and `photoTakenOn` are optional. Note the casing: this function
takes **camelCase**, while `add-weather-source` takes snake_case. That
inconsistency is real and is not worth a client papering over silently.

The server rebuilds every message as `{role, content}` and **drops every
other key**. The React client's message type also carries `feedback`,
`sources` and `tokens`; a `feedback` key reaching Anthropic once 400'd the
whole request permanently, which is why the narrowing exists.

**`Accept` selects the response shape**, by a raw substring test for
`text/event-stream`. Anything else --- including `*/*` --- gets buffered JSON.
A Swift client that lets URLSession default the Accept header gets the
buffered path and will wonder where the streaming went.

### The SSE wire format

Each event is written as exactly `data: <compact JSON>\n\n`. There is **no
`event:` line, no `id:`, no `retry:`, no `[DONE]` sentinel and no
heartbeat**. The stream ends by closing the body. A single frame can be split
across TCP reads, so buffer on `\n\n` and keep the remainder.

Seven event types, exhaustive:

| type | payload | notes |
|---|---|---|
| `turn` | `{index: Int}` | 1-based, before each model call, max 15 |
| `thinking` | `{text: String}` | summarized reasoning — a **separate channel**, never append to the answer |
| `text` | `{text: String}` | incremental delta, not cumulative |
| `tool` | `{name, state: "start"\|"done"\|"error", detail?}` | `detail` key is **absent**, not null, when it has none |
| `usage` | `{inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}` | **once per turn, not per request** |
| `done` | `{text: String}` | terminal success |
| `error` | `{message: String}` | terminal failure *after* a 200 |

**Three things here that a reasonable implementation gets wrong.**

*`usage` must be summed.* It fires at the end of every model turn, so a
request with three tool iterations emits three `usage` events each covering
only its own turn. A client that overwrites shows the last turn's numbers and
under-reports cost.

*`done.text` is not the concatenation of the deltas.* The server pushes
`turn.text.trim()` into its accumulator and joins with `\n\n`, while the
deltas are the raw untrimmed text plus an explicitly emitted `{"type":"text","text":"\n\n"}`
separator. Any leading or trailing whitespace on a turn is in the deltas and
not in `done`. Render the deltas and then swap in `done.text` and the message
visibly re-flows. The trimmed join is what gets persisted.

*`error` can never be an HTTP status,* because the 200 has already been sent.
`message` is `String(err)`, so it carries the `Error: ` prefix. No `done`
follows it.

**Ordering.** `turn(1)` → thinking/text deltas interleaved → `usage` → either
`tool(start)…tool(done|error)…` then `turn(2)`, or `done`. Tools in one turn
run under `Promise.all`, so with multiple tool blocks the start/done events
can interleave and there is **no id to correlate them** --- only `name`.

**Two edge cases.** If all 15 iterations are consumed, a final call runs with
tools disabled and emits no `turn` event before `done`; if its text is empty,
`done.text` is the literal string `"That took more searching than expected -- try asking a narrower question."`.
And a stream that ends with neither `done` nor `error` is currently accepted
as a complete answer and logged as if whole --- the React client exits its
read loop on the reader's `done` and returns what it has. **That is a bug to
decide about deliberately in Swift, not to reproduce.**

### Errors

Two shapes, and they do not share a key:

- **401** — `{"error": "Not signed in, or this account has no producer."}`
- **500** — `{"type": "error", "message": "<String(err)>"}`

The 401 uses `error`. The 500 uses `type` and `message`. Decode both.

### The buffered fallback is a second billed turn

`streamChatMessage` re-sends the entire request with
`accept: application/json` when the streamed attempt throws a non-service
error, was not aborted, and received nothing. This is not a legacy path to
skip: it is the documented fix for the iOS shell's intermittent `Load failed`.
It costs a second model turn.

The buffered 200 body is `{"type": "text", "text": String}` and emits **no
`usage` at all**, which is why token counts and sources are optional on a
message. Tool-iteration exhaustion also returns its canned string as a normal
200, not an error.

---

## 3. The other Edge Functions

`chat` and `add-weather-source` are browser-facing. `ingest-weather`,
`sync-scheduled-weather`, `scan-conversations-for-observations` and
`embed-scheduled-memory` are cron-triggered and authenticate with a trigger
token rather than a user JWT (see
[`monitoring.md`](monitoring.md)); a native client calls none of them except
`ingest-weather`, and only if it wants a "Sync now".

**`POST /functions/v1/add-weather-source`** — request is **snake_case**:
`{"provider_id": uuid, "name": String, "station_id": String, "secret": String}`.
`station_id` is the number a producer reads off tempestwx.com; the function
translates it to Tempest's internal device id server-side. Success is 200
`{"id": uuid}`, which the React client discards entirely --- so nothing in
TypeScript documents it. **Every** failure is a 400 `{"error": String}`,
including "no such station". Never a 404, never a 422.

**`POST /functions/v1/ingest-weather`** is a loop, not a call. Body is
`{"source_id": uuid}`; the response is
`{done, rows_processed?, backfill_status?, backfill_cursor?, last_synced_at?}`
and `done: false` means *call me again* --- the caller drives the chunking, 5
days at a time. Nothing in TypeScript implements that loop, so a Swift author
has no reference implementation, only the pg_cron callers.

It can also return **HTTP 200 carrying a failure**: the chunk helper returns
`{done: false, error: ...}` and the handler serializes it with no status
override. Status code is not the error signal here; the presence of `error`
is.

---

## 4. PostgREST: tables and RPCs

Thirty-odd calls across `app/src/data/`. The modules are the readable
reference for column lists and filters and are not duplicated here; what
follows is what a second client cannot read off them.

**RPC argument types that are easy to get wrong in Swift.**
`create_observation_candidate` takes `p_photo_latitude double precision`,
`p_photo_longitude double precision`, but `p_photo_accuracy_m real` ---
`Double, Double, Float`. Also `p_observed_date date`, `p_client_id uuid`,
`p_source text default 'producer'`. Two raises arrive as HTTP 400 / `P0001`:
`No producer for this user` and `A candidate needs a summary` (on null *or
whitespace-only*). Its replay branch returns the existing row's id and
inserts nothing --- see §7.

**`confirm_write` always returns a JSON array**, never an object and never
null: the function ends in `coalesce(jsonb_agg(...), '[]'::jsonb)`. The
element shape is not fixed, but the container is, so `[[String: JSONValue]]`
is a safe decode target.

**`app_status` is polled while signed out.** The maintenance check runs
before the session check, so it is the one PostgREST request made with no user
token --- `Authorization: Bearer <publishable key>` --- and it is why `anon`
holds a select grant on that table and nothing else. Every error is swallowed
and returns nil, deliberately: *not knowing means carry on*. It uses
`.single()` with no filter, so a second row in `app_status` silently disables
the whole mechanism.

**Release notes come from GitHub, not Supabase.** The client fetches the
releases list directly, sends no Accept, no User-Agent and no token, takes
`releases[0]` as latest, and treats any failure as an empty list. It is
therefore subject to GitHub's 60-request/hour unauthenticated IP limit, which
nothing currently handles.

---

## 5. Storage

Bucket holds observation photos at `<producer_id>/<uuid>.jpg`. **The path is
the tenancy check** --- the RLS policy casts the first path segment to a uuid
and compares it to the caller's producer.

**There is no UPDATE policy, only select, insert and delete.** So
`upsert: true` is a **403, not an overwrite**, and the omission is deliberate:
replacing bytes in place would let the evidence behind a confirmed
observation change while the row still reads the same path. A Swift uploader
that turns upsert on "to be safe" gets the opposite of safe.

Signed URLs are minted per photo, uncached, 300s. A log with N photos is N
sign requests.

Client-side and not in any contract, but load-bearing: downscale to 1600px
long edge at JPEG quality 0.82, `contentType: image/jpeg`.

---

## 6. Auth

Native sign-in exchanges a Google ID token for a Supabase session. Two
details live only as comments in `nativeAuth.ts` and both are correctness,
not UX:

**The nonce goes in two forms.** The SHA-256 hex digest goes to Google and
lands in the `id_token`'s nonce claim; the raw value goes to
`signInWithIdToken`, which hashes it again and compares. Omitting the nonce
does not opt out --- the SDK generates its own, which we never see, and
Supabase rejects the mismatch.

**`forcePrompt` is required for correctness.** Without it the plugin takes a
restore-previous-sign-in path whenever a previous sign-in exists, returning a
cached `id_token` carrying the nonce from the *original* interactive sign-in.
Supabase reports "Nonces mismatch".

Session refresh is implicit in the client defaults; no growdy source calls it.

**Bundle-bound, and therefore not portable as-is:** Google binds iOS OAuth
clients to a bundle identifier, and the reversed client id is a URL scheme in
`Info.plist`. A native client under a new bundle id needs its own OAuth
client. The web client id is not bundle-bound and carries over. Sign in with
Apple needs a paid Apple Developer team and is unavailable today
([`0029`](decisions/0029-ios-shell-and-native-sign-in.md)).

---

## 7. Contracts that are not requests

The most dangerous part of this document, because none of it is visible in a
network trace and all of it is load-bearing.

**The offline queue ([`0037`](decisions/0037-what-happens-with-no-signal.md)).**
Every capture goes to the queue first and the queue is flushed immediately ---
there is no "send, and queue on failure" branch. The offline path and the
online path are the same code, which is the whole point: the fallback is
never a path only exercised where nobody is watching.

- `clientId` is minted at capture and is **the idempotency key**.
  `create_observation_candidate` returns the already-filed row's id rather
  than inserting again, scoped to `client_id` *and* `producer_id`, backed by a
  unique index. This is why the write side needs no retry.
- The flush delivers in `queuedAt` order and **stops at the first failure**,
  so one bad minute does not burn the attempt counter on the whole queue.
- Give up after 5 attempts --- but a stuck item is **never dropped**. It stays
  visible as stuck, because a queue that drops things quietly is worse than no
  queue.
- The uploaded `photoPath` is written back to the queue item *even on the
  failure path*. Without that, each retry orphans another copy of the photo.
- GPS is captured at capture time, never at flush. *A point taken at flush is
  a lie about where the vine is.*
- Known asymmetry: **a queued photo loses its EXIF**, because the queue path
  uploads with no metadata while the chat path sets it.

**The fenced-block protocol is a wire format, not rendering.** The model emits
JSON inside a fence tagged `confirm-write` or `log-observation` and the client
turns it into a button. `confirm-write` requires a string `proposal_id`;
`log-observation` requires a non-blank `note`, with optional `observed_date`,
`planting_id`, `photo_path`. Two pieces of state live only on the client and
must be reproduced or the buttons file wrong data: the last photo path fills
in a `photo_path` the model cannot know, and a client-side map from path to
`{location, takenOn}` supplies the coordinates and the fallback observed date.
Device position is read at **send**, and only for camera captures --- not for
library picks.

**Upload on attach, delete on remove.** The photo uploads the moment it is
attached, not when the turn is sent, and the object is deleted if the producer
backs out. A client that uploads at send changes a latency profile that was
chosen on purpose; one that uploads at attach and skips the delete leaks
unreferenced objects into a bucket nobody can see.

**Transcript persistence is fire-and-forget and self-healing.** The "started"
flag is set *after* the create resolves, so a failed create does not turn
every later write into an update of a row that never existed. Log calls are
unawaited and errors swallowed, because the next turn rewrites the whole
transcript. A client that awaits these and surfaces the errors will report
failures the React client deliberately absorbs.

**The client writes conversation history; the server never does** --- and two
backend features depend on it. Per
[`0011`](decisions/0011-conversation-history.md) the client generates the
conversation id and upserts the whole transcript after each message, with no
involvement from the `chat` function. Two `pg_cron` jobs then read that table:
`scan-conversations-for-observations` and `embed-scheduled-memory`. So a
client that talks to `chat` and never writes `conversations` does not merely
lose its own history screen --- it **silently switches off observation
scanning ([`0030`](decisions/0030-every-observation-through-one-queue.md)) and
producer memory ([`0023`](decisions/0023-producer-memory-via-embeddings.md))**
for whoever uses it. Nothing fails; the features just stop happening.

**Every client polls `app_status.maintenance`**, for the reason in §4: it is
the only thing that can stop a client while someone works directly against
production.

**The unsent-chat retry** is a different mechanism from the buffered fallback:
the whole request is stored on failure, re-delivered automatically on
reconnect, and offered as a manual button. Because `photoPath` is carried, the
retry does **not** re-upload the photo.

---

## 8. What does not port

**The stale-version check has no native analogue.** The client re-fetches its
own `index.html` every 30s and on visibility change, scrapes a `<meta name="app-version">`
and compares it to the build's version; a mismatch is half of what drives the
blocked screen, the other half being the maintenance flag. There is no
`index.html` to re-fetch in a native app. This needs a deliberate replacement
--- not a silent drop --- because it is the only thing that currently tells a
producer their app is running old code.

**Nothing subscribes to Postgres changes.** There is no realtime channel
anywhere in the client, so the native client inherits no contract here and is
free to choose.
