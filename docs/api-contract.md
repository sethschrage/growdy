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
where the code and a comment disagree the code is recorded. It covers every
network call in `app/src`, across six surfaces: the Edge Functions,
PostgREST, storage, auth, GitHub's releases list and the app's own
`index.html`.

**Corrected 2026-09-22.** Before any Swift was written, an audit found this
file wrong or silent in every numbered section --- reads that also retry on
network errors, error shapes that differ by surface, hosted settings that
had only ever been read from the local `config.toml`. This revision is
checked against the code and, where the code cannot say, against the live
project on that date.

**How to use it.** Where this file speaks, trust it over reading
`app/src`. Where it defers --- column lists and filters are left to the
`app/src/data/` modules (§4) --- read those, and write back here what you
relied on, in the same PR. Where the code and this file disagree, the code
is what runs and this file is the bug: fix it here, not around it.

**It is not a tutorial and not a wish list.** Everything here is what the
backend does today. Where the React client does something the contract does
not require --- a retry, a cache, a defaulted field --- that is called out
as client behaviour, because a second client that silently drops it is a
regression and a second client that silently copies it may be preserving a
workaround. The one backend change already decided --- conversation saving
through database functions that both clients call --- is planned in
[`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md)
with its own ADR to follow, and appears here once it exists. How the native
client meets this contract --- its retry policy per endpoint, its session
store, its outbox --- is decided there too, not here.

---

## 1. Cross-cutting

**Base URL.** `https://fostmbhpnhjzhulphxzp.supabase.co`. Edge Functions sit
under `/functions/v1/<name>`, PostgREST under `/rest/v1/`, storage under
`/storage/v1/`, auth under `/auth/v1/`.

**Two keys, different jobs.** The publishable key (`sb_publishable_…`)
identifies the *project* and is safe to ship in a client; the session
access token, a JWT from `/auth/v1`, identifies the *user*. Checked against
the hosted gateway on 2026-09-22:

- **`apikey: <publishable key>` on every request.** Without it the gateway
  refuses PostgREST and auth with 401
  `{"message": "No API key found in request", "hint": ...}`, and storage,
  given neither key nor token, answers 400. The Edge Functions ignore it;
  the React client sends it to them anyway.
- **`Authorization: Bearer <access_token>` only when there is a session.**
  With `apikey` alone the gateway runs the request as `anon`. Signed out,
  supabase-js instead sends `Authorization: Bearer <publishable key>` to
  PostgREST and storage --- not to the functions --- which the gateway
  accepts only because it equals `apikey`. To PostgREST, a bearer that is
  neither that key nor a JWT this project signed is a 401 `PGRST301`.
- **A bad token is refused even where `anon` could read.** `app_status`
  answers 200 to no `Authorization` and 401 `PGRST301` to a JWT it cannot
  verify. The React client never sends an expired one knowingly: when the
  access token has expired and the refresh fails, `getSession()` yields no
  session, supabase-js falls back to the publishable key and the request
  runs as `anon`. `chat.ts`, which reads the session itself, refuses to
  send instead.

**Authorization is the whole access model.** `verify_jwt` is `false` on all
six Edge Functions (read back from the live project on 2026-09-22),
deliberately, for two reasons: the three that act for a signed-in user ---
`chat`, `add-weather-source`, `ingest-weather` --- must answer their own
CORS preflight, which a gateway JWT check cannot exempt, and the three
`pg_cron` functions are called by Postgres, not a user. So the gateway
checks nothing and each function self-authorizes. The three user-facing
ones do the same three things before any work: answer `OPTIONS`, resolve a
producer, then work. The resolve is a `select producer_id from profiles`
with no `.eq()` --- RLS's `id = auth.uid()` makes the row necessarily the
caller's, and `anon` holds no grant on `profiles` at all, so a request with
no usable JWT gets an error rather than an empty set. Any error and a
missing row both return `null`, and `null` means 401. They read only
`Authorization`.

**No user-facing function uses the service-role key.** Each builds its
database client from the publishable key and the caller's own forwarded
`Authorization`, so every read the chat performs on the producer's behalf
is RLS-scoped: **RLS decides what the model can see, not the function**.
The three `pg_cron` functions --- `sync-scheduled-weather`,
`scan-conversations-for-observations`, `embed-scheduled-memory` --- are the
exception: they run as `service_role`, gated by a short-lived trigger
token in `X-Cron-Secret` that a database function verifies (§3).

**Reads retry themselves. Writes do not.** This is the single easiest thing
to lose in a rewrite. `postgrest-js` (2.116.0) runs every REST call through
`fetchWithRetry`, which silently retries a `GET`, `HEAD` or `OPTIONS` in
two cases: when the fetch itself **throws** --- offline, connection lost,
the common one-bar failure --- and when the response is **503 or 520**. It
makes up to **3 retries, so up to 4 requests**, waiting 1s, 2s, then 4s.
On a 503 or 520 carrying `Retry-After`, the wait is that header read as
whole seconds, with no cap; an HTTP-date there parses as nothing and the
retry is immediate. Each retry carries `X-Retry-Count: 1`, `2` or `3`. An
aborted request is never retried. Nothing else is: not a 500, which is how
a statement timeout (`57014`) arrives --- `authenticated` is capped at 8s,
`anon` at 3s --- and not a 504. It is on by default and nothing in growdy
turns it off.

It covers PostgREST reads and nothing else. POST, PATCH and DELETE are
outside the method list, and so is **every RPC**: `.rpc()` sends POST
unless asked for `get` or `head`, and no call in `app/src` asks. So
`confirm_write`, `create_observation_candidate`, every PATCH and DELETE
are single-shot. storage-js and the Edge Function calls have no retry at
all; the chat's buffered fallback (§2) is a different mechanism.

Single-shot is not the same as unsafe to repeat. Replaying after a lost
response is harmless for `create_observation_candidate` with a `client_id`
(it returns the row already filed, §7) and for
`confirm_observation_candidate` (anything no longer pending returns
`null`), and wrong for `confirm_write`, which raises
`no pending write found for this proposal` when the first call already
applied it (§4). A native client written from the endpoint list alone
would have no retry anywhere, which is a real regression for a vineyard
with one bar of signal; its per-endpoint policy is in
[`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md).

**Each surface has its own error shape**, so decode per surface:

- *Gateway*, missing `apikey`: 401 `{"message", "hint"}`, with no `code`.
- *PostgREST*: `{"code", "message", "details", "hint"}`, `details` and
  `hint` nullable. The status follows the code: a `raise` (`P0001`) is
  400, `23505` and `23503` are 409, `42501` is 401 as `anon` and 403
  signed in, a `.single()` that did not get exactly one row (`PGRST116`)
  is 406, a JWT failure (`PGRST30x`) is 401, a statement timeout
  (`57014`) is 500.
- *Edge Functions*: the three user-facing ones share one 401,
  `{"error": "Not signed in, or this account has no producer."}`; every
  other shape is per function (§2, §3). The platform can also answer in
  none of those shapes: 503 (the function failed to boot), 504 (it
  outlived the request timeout), 546 (a resource limit).
- *Storage*: almost every error is HTTP **400**, with the real status as a
  string in the body --- a token storage cannot verify gets 400
  `{"statusCode": "403", "code": "AccessDenied", "error": "Unauthorized",
  "message": "signature verification failed"}`. A bad or expired token is
  never a 401 there (§5).
- *Auth*: three shapes of its own, two of them chosen by the
  `X-Supabase-Api-Version` header (§6).

**A 401 from PostgREST or a user-facing function means nothing took
effect.** PostgREST refuses a token before it runs the query, and a
`42501` as `anon` rolls back with its statement; the functions return
their 401 before any work. So refreshing the session and replaying the
request **once** is safe for everything those two surfaces take, writes
included, `confirm_write` too. That is a different rule from the transient
retry above: a 401 is a refusal, while a lost response says nothing about
whether a write landed. The React client never replays; it avoids the 401
instead. supabase-js calls `getSession()` before every request, and
`chat.ts` calls it before a chat send; it refreshes once the access token
is within 90s of expiry. Once the token has expired and the refresh has
failed, supabase-js sends PostgREST and storage requests as `anon` and
`chat.ts` refuses to send --- so a 401 from PostgREST in React is a
session that is already gone. Two limits on the rule:

- **The functions' 401 does not say why.** One body answers an expired
  token, a signed-in account with no `profiles` row, and a `profiles`
  lookup that failed for any other reason, a transient one included. A
  second 401 after a fresh token proves nothing on its own;
  `GET /rest/v1/profiles?select=producer_id` does --- a row means the
  account has a producer and the 401 was something else, `[]` means no
  producer, a 401 `PGRST30x` means the token itself is dead, and any other
  error settles nothing. The React client draws the same line
  after sign-in: a failed check leaves it on its loading state rather than
  the no-producer screen.
- **Storage never answers a bad token with 401** (§5), so a rule keyed on
  the status never fires for a photo.

**Headers `supabase-js` always sends to PostgREST**, easy to omit by hand:
`Accept-Profile: public` on GET/HEAD, `Content-Profile: public` on
everything else, and `Content-Type: application/json` on every non-GET/HEAD
*including DELETE*.

**No write asks for its result back.** React's inserts, updates and
deletes send no `Prefer` header, so PostgREST answers 201 or 204 with an
empty body --- and a PATCH or DELETE whose filter matched no row, because
the row is gone or RLS hides it, gets the same 204. Where "nothing
matched" matters, send `Prefer: return=representation`: the body is then
the affected rows, and `[]` means nothing changed. A PATCH or DELETE with
no filter at all is refused rather than applied to every row RLS allows,
because `authenticator` preloads `safeupdate`.

**`.single()` and `.maybeSingle()` are not the same request.** `.single()`
sends `Accept: application/vnd.pgrst.object+json` and lets PostgREST
enforce cardinality: zero rows or several is a 406 `PGRST116`.
`.maybeSingle()` sends no Accept override and enforces it client-side on
the array: `[]` is `null`, and more than one row is the same 406
`PGRST116`, made up by the client. Reproduce the asymmetry, or a zero-row
`.maybeSingle()` becomes an error instead of a `nil`. `.single()` backs the
`app_status` poll and the planting detail read; `.maybeSingle()` backs the
three `profiles` reads.

**Reads stop at 1000 rows, silently.** PostgREST truncates at `max_rows`
and answers 200 rather than erroring, so a list that comes back with
exactly 1000 rows is a list that may have more. The response does not say
so unless asked: `Prefer: count=exact` puts the real total after the slash
in `Content-Range`, which is otherwise `*`. No React read is near the cap
--- plantings are read only by id, by row, or 20 at a time for the
typeahead, and the largest unbounded lists are observations (211 rows on
2026-09-22) and conversations (74). But `planting_readable`, the view
those reads go through, already returns 3,004 rows for the one producer,
so the first unfiltered read of plantings, which a map layer is, gets a
third of them.

**`supabase/config.toml` configures the local stack** --- the one CI's
`supabase db start` brings up, with `site_url = "http://127.0.0.1:3000"`
--- and nothing in the repo pushes it to the hosted project. The hosted
values a client depends on were read from the dashboard on 2026-09-22 and
agree with it wherever it sets them:

| Setting | Hosted |
|---|---|
| Data API max rows | 1000 |
| Access token (JWT) expiry | 3600s |
| Refresh-token rotation with reuse detection | on |
| Refresh-token reuse interval | 10s |
| Session time-box, inactivity timeout | none, none |
| Single session per user | off |

What rotation means for a client that stores the refresh token is §6. The
expiry is a dashboard setting that can change without a commit, so the
token's own `exp` is the authority, not 3600. The Google provider --- its
client ids and its nonce check --- exists only on the hosted project and
has no `[auth.external.google]` block in `config.toml` (§6).

**Ids.** Client-minted UUIDs appear in three places, all from
`crypto.randomUUID()`, which is lowercase: the conversation id, the
queue's `clientId`, and the photo's object name. The first two land in
`uuid` columns, where Postgres ignores case and answers lowercase. The
object name does not: a storage path is text, copied as-is into
`observation_candidates.photo_path`, from there into
`observations.photo_metadata`, and sent to chat as `photoPath`. Swift's
`UUID().uuidString` is **uppercase**. The storage policy casts only the
first segment, the producer id, to `uuid`, so case never fails the tenancy
check --- but an uppercase name is a different object from its lowercase
twin, and all 11 objects in the bucket today are lowercase
`<uuid>/<uuid>.jpg`. Lowercase them.

**Dates.** A `date` on the wire is `YYYY-MM-DD`, and Postgres refuses an
impossible one (`2026-02-30`, `0000-00-00`) rather than rolling it over.
`exifObservedDate` gives the calendar date written in the photo's
`DateTimeOriginal`, which is the camera's local wall time with no zone: it
parses the string as local time and formats it back as local time. Going
through `Date` also rolls an impossible EXIF date over (`2026:02:30`
becomes `2026-03-02`), so React never sends one; a port that slices the
string would. The trap is `ISO8601DateFormatter`, whose time zone defaults
to GMT: use it and, anywhere west of UTC, a photo taken at 11pm files
itself to tomorrow. The observation form's default date is the device's
local today, not UTC's.

**Timestamps** arrive in UTC as ISO 8601 with a `+00:00` offset and a
fraction of up to six digits, trailing zeros trimmed and dropped entirely
when zero: `2026-09-22T10:11:12+00:00`, `2026-09-22T10:11:12.5+00:00`. The
React client writes them with `toISOString()` (`…T10:11:12.123Z`). A JSON
number is not a timestamp; Postgres refuses it.

---

## 2. `POST /functions/v1/chat` --- the one that streams

The centrepiece, and the only endpoint where getting the contract slightly
wrong produces something that looks like it works.

**Request.** Headers: `content-type: application/json`,
`authorization: Bearer <access_token>`, `apikey: <publishable key>`, and
`accept`. That is what the React client sends; the function itself reads
only `authorization` and `accept`. Body:

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
whole request permanently, which is why the narrowing exists. Apart from
the photo below, `content` is forwarded as sent, checked for neither type
nor emptiness. The whole conversation is resent with every question and
nothing trims it on either side. Tool results and reasoning live only
inside one request, so all the model knows of an earlier answer is the
`content` the client sends back for it, fenced blocks included.

**`photoPath` is checked only for being a non-empty string.** The function
signs a 300 s URL for it under the caller's JWT, then attaches the image
and a line naming the path to the last `user` message, for this request
only. `photoTakenOn`, if it is a non-empty string, goes into that line
unchecked; without a `photoPath` it is ignored. A path the caller cannot
sign is a 500 before any model call. The signed URL goes to Anthropic as
an image `url` source, so Anthropic fetches the image inside the model
call, which runs in the stream: an image it refuses arrives as an
in-stream `error`, not a status.

**`Accept` selects the response shape**, by a raw, case-sensitive
substring test for `text/event-stream`. Anything else --- including `*/*`
--- gets buffered JSON. A Swift client that lets URLSession default the
Accept header gets the buffered path and will wonder where the streaming
went. Send `Accept: text/event-stream` explicitly and check what came
back: a streamed 200 is `content-type: text/event-stream` (no charset)
with `cache-control: no-cache` and `x-accel-buffering: no`, and a 200 with
any other content type is the buffered body. React quietly parses that as
a buffered reply, a branch kept for a function deployed before streaming
existed.

**The token has to outlive the stream.** The function forwards the
caller's JWT to every database and storage call it makes, tool calls late
in a long answer included. A token that expires mid-stream fails those
calls as tool errors --- `tool` events with `state: "error"`, and a model
working without the data --- never as a 401. Access tokens live 3600 s
(hosted, verified 2026-09-22), and React's `getSession()` keeps handing
out the stored token until it is within 90 s of expiry (auth-js
`EXPIRY_MARGIN_MS`), which is less than a stream can run.

### The SSE wire format

Each event is written as exactly `data: <compact JSON>\n\n`. There is **no
`event:` line, no `id:`, no `retry:`, no `[DONE]` sentinel and no
heartbeat**. The stream ends by closing the body. The first frame of every
stream is `{"type":"turn","index":1}`, enqueued as the stream is created.

**Split on the byte 0x0A and on nothing else.** `JSON.stringify` escapes
`\n` and `\r`, so each frame is a single `data:` line and the body never
contains a `\r`. It does **not** escape U+2028, U+2029 or U+0085, which
arrive raw inside any string --- `text`, `thinking` and `done` above all
--- and every non-ASCII character arrives as raw multibyte UTF-8. A frame
can be split across reads and so can a character: buffer bytes, cut at
each 0x0A (which never occurs inside a multibyte sequence), decode each
complete line as UTF-8, dispatch on the empty line, and keep the
remainder. Decoding each chunk to a string on its own breaks characters at
the seams, and a splitter that honours Unicode line breaks cuts a frame
into unparseable pieces.
`URLSession.AsyncBytes.lines` is such a splitter: it drops the empty line
that ends each frame and breaks at U+2028, U+2029 and U+0085 (measured on
macOS 26.6), so a `done` whose text holds one is lost outright.

Seven event types, exhaustive:

| type | payload | notes |
|---|---|---|
| `turn` | `{index: Int}` | 1-based, before each model call that has tools, max 15 |
| `thinking` | `{text: String}` | summarized reasoning --- a **separate channel**, never append to the answer; blocks run together with no separator, and only `turn` marks a new call |
| `text` | `{text: String}` | incremental delta, not cumulative |
| `tool` | `{name, state: "start"\|"done"\|"error", detail?}` | client tools only; `detail` is **absent** (never null) or a string, which can be `""` |
| `usage` | `{inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}` | **once per model call, not per request** |
| `done` | `{text: String}` | terminal success; `text` can be `""` |
| `error` | `{message: String}` | terminal failure *after* a 200 |

**Treat `type` and `tool.name` as open sets.** React hands every parseable
object to a reducer that ignores types it does not know, and skips frames
`JSON.parse` rejects, so the server can add an event or a field without
breaking it. A decoder that throws on an unknown `type` breaks only the
second client.

**Which tools announce themselves.** Only the five client tools produce
`tool` events --- `execute_readonly_query`, `propose_write_query`,
`get_grape_phenology`, `search_memory`, `view_photo` --- plus any name the
model invents, which gets `start` then `error`. The end event recomputes
`detail` from the same input, so it repeats its start's. By tool:

- `execute_readonly_query`: the names after `from` and `join`, lowercased,
  with a `public.` prefix and double quotes dropped, deduplicated in
  first-seen order and joined with `", "`; `lateral`, `unnest`,
  `generate_series`, `jsonb_array_elements` and `select` are skipped.
  Absent if none parse.
- `search_memory`: the query, cut with `.slice(0, 60)`; `""` when the
  query is empty. The cut counts UTF-16 units, so an emoji straddling
  unit 60 leaves a lone high surrogate, which `JSON.stringify` writes as
  an escape such as `\ud83c`. JavaScript parses it; Foundation's
  `JSONDecoder` and `JSONSerialization` reject the frame, and the end
  event carries the same `detail`, so both halves of that step are lost.
- `get_grape_phenology`: `"<start_date> to <end_date>"`.
- `propose_write_query`, `view_photo`: absent.

**Web search and web fetch emit no `tool` event.** They are Anthropic
server tools (`web_search_20260318` and `web_fetch_20260318`, up to 5 uses
each per model call), run by the API inside a model call and returned as
`server_tool_use` blocks, while the function announces only `tool_use`
blocks. Nothing announces them but a silence, and Anthropic documents a
pause while a search runs. React's "Searching the web" and "Reading a
page" phrases and its `web` source never fire.

**Four things here that a reasonable implementation gets wrong.**

*`usage` must be summed, and the sum is a lower bound.* It fires at the
end of every model call, the forced final call below included, so a
request that makes three model calls emits three `usage` events each
covering only its own call. A client that overwrites shows the last
call's numbers and under-reports cost. `inputTokens` excludes cache reads
and writes, so a call's input is the sum of all three input fields. Even
summed it under-counts: a call that fails emits no `usage`; input and
cache counts are read from `message_start` only, though Anthropic's
cumulative count on `message_delta` is higher once a server tool has run
(its own web-search example: 2,679 at the start, 10,682 at the end); and
search fees ($10 per 1,000) are not reported at all.

*`done.text` is not the concatenation of the deltas.* The server pushes
`turn.text.trim()` into its accumulator and joins with `\n\n`, while the
deltas are the raw untrimmed text plus an explicitly emitted
`{"type":"text","text":"\n\n"}` separator between calls. Any leading or
trailing whitespace on a turn is in the deltas and not in `done`. Render
the deltas and then swap in `done.text` and the message visibly re-flows.
The trimmed join is what gets persisted.

*`done.text` can be empty.* It is `""` when no call in the request wrote
anything but whitespace. The function never reads `stop_reason`, so any
call that ends without asking for a client tool is taken as the final
answer, whatever it holds --- one that hit `max_tokens` (4,096), or a web
search Anthropic paused with `pause_turn`. Only the exhausted path below
substitutes a canned string. React treats an empty `done.text` as absent
and keeps the deltas instead.

*`error` can never be an HTTP status,* because the 200 has already been
sent. `message` is `String(err)`, so it starts with the class name of
whatever was thrown: `Error: ` for everything the function throws itself,
`TypeError: ` for a failed network call. A call Anthropic refuses reads
`Error: Anthropic API error (<status>): <Anthropic's response body>`; an
error reported inside Anthropic's own stream reads `Error: <its message>`,
so an overload mid-answer is `Error: Overloaded`, with no 529 anywhere in
it. No `done` follows an `error`, and the call it interrupted emits no
`usage`. React shows `message` verbatim, prefix included.

**Ordering.** `turn(n)` → thinking/text deltas interleaved → `usage`.
Then, if the call asked for client tools: every `tool(start)`, each
`tool(done|error)` as its tool finishes, the `"\n\n"` text separator ---
after the tool events, and only if that call's text was not blank --- then
`turn(n+1)`. If it asked for none: `done`. The tools of one call run under
`Promise.all` and each emits `start` before its first `await`, so every
start precedes every end. There is **no id to correlate them**: an end
repeats its start's `name` and `detail`, so match on the pair. React
matches on the name alone and closes the most recent running step. Two
calls with the same pair cannot be told apart by anyone. An `error` can
arrive at any point after `turn(1)`.

**Exhaustion.** If all 15 iterations are consumed, a final call runs with
tools disabled and emits no `turn` event, only deltas, `usage` and `done`.
If no call in the request wrote anything but whitespace, `done.text` is
the literal string
`"That took more searching than expected -- try asking a narrower question."`.

### Silence, cancellation and cut-off streams

**No heartbeat, and the silences are long.** The function drops
Anthropic's `ping` events and writes nothing while a client tool runs or a
server tool runs inside a model call. The two SQL tools are capped at 5 s
by `statement_timeout`; the phenology, embedding and Anthropic fetches
have no timeout. The only bound on a silence is the platform's wall clock,
which caps the whole stream too: a worker lives at most 150 s on this
project's free plan (400 s on paid), and it can serve other requests
first, so a stream can be cut sooner. A client idle timeout shorter than
that limit kills healthy answers; URLSession's default
`timeoutIntervalForRequest` is 60 s.

**Cancelling does not stop the work.** Nothing in the function reads
`req.signal`, the stream has no `cancel` callback, and neither the
Anthropic fetch nor any tool can be aborted. Whether Supabase's runtime
tells the worker the client left is not visible from the repo; if it
cancels the body, the loop stops at its next write, when `enqueue` throws.
Either way the step in progress is paid for, and at worst every remaining
call runs too. The server never saves an answer (§7), so one the client
stops reading is billed and lost.

**A stream can end with neither `done` nor `error`.** Nothing writes an
event when the platform stops the worker --- at its wall clock, its 2 s
CPU limit, or an early retirement --- and a connection can also just
drop. Supabase documents SSE streams that hit the wall clock or early
retirement ending with no close marker; its workaround,
`EdgeRuntime.waitUntil`, appears nowhere in the function. React accepts a
clean end as a complete answer: it leaves its read loop on the reader's
`done`, returns `done.text` or else the concatenated deltas, and persists
and logs that as whole --- an empty string, if no frame arrived. **That is
a bug to decide about deliberately, not to reproduce**; the native client
treats such an answer as cut off
([`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md)).

### Errors

Where a request fails decides the shape, and the JSON shapes do not share
a key:

- **401** `{"error": "Not signed in, or this account has no producer."}`
  --- before anything is billed. It is ambiguous by construction: a
  missing, malformed or expired token, an account with no `profiles` row
  and a producer lookup that failed for any other reason all collapse into
  it. The function logs a failed lookup's error; from a client, only a
  `profiles` read tells them apart (§1).
- **500** `{"type": "error", "message": "<String(err)>"}` --- on a
  streamed request, anything thrown before the stream starts, which is
  also before any model call: a body that is not JSON (`SyntaxError: …`),
  a `messages` that is present but not an array (`TypeError: …`), a
  `photoPath` the caller cannot sign
  (`Error: Could not read that photo: …`).
- **`error` event** after a 200 --- everything that fails once the model
  is involved, Anthropic's refusals included (above).
- **Platform** --- Supabase answers some requests itself. 503 `BOOT_ERROR`
  (the function failed to start) and 546 `WORKER_RESOURCE_LIMIT` (CPU or
  memory, and per Supabase's troubleshooting guide sometimes the wall
  clock; formerly `WORKER_LIMIT`) are documented with
  `{"code": String, "message": String}` bodies; 504 means no response
  began within 150 s. A limit hit after the 200 cannot change the status;
  the stream just ends.

The 401 uses `error`; the 500 and the platform bodies use `message`. React
reads `error ?? message` and otherwise shows
`The chat service answered <status>.` Its test fixture for a 401,
`{"message": "Invalid JWT"}`, is not a body this function returns.

### The buffered fallback is a second billed turn

The fallback is React client behaviour; the backend only provides the
buffered shape it falls back to. `streamChatMessage` re-sends the entire
request with `accept: application/json` when the streamed attempt throws,
the failure is not one the server reported (a non-2xx status or an
`error` event), the request was not aborted, and **no frame had been
parsed yet**. A failure after the first parsed frame is rethrown, never
retried.

The trigger is intermittent transport, not a client that cannot stream.
The code's own account is a dropped connection, a backgrounded app or a
cold start landing badly, first seen as the iOS shell's bare `Load failed`
--- and URLSession is exposed to all three. In that incident the function
had already answered 200, run the model and logged a complete turn:
"nothing parsed" means no whole frame reached the client, not that
nothing ran. So the fallback can pay for one question twice, the whole
loop again, tools included. The native client does not build it
([`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md)).

The buffered 200 body is `{"type": "text", "text": String}` as
`application/json`, and it emits **no `usage` at all**, which is why token
counts and sources are optional on a message. Its `text` is the first
text block of the final model call, untrimmed, rather than the join
`done.text` carries, so text from earlier calls and from any later block
--- a web search splits an answer into several --- is dropped.
Tool-iteration exhaustion is a normal 200, not an error; the canned string
replaces an empty final text. Every failure after the 401 check is a 500
`{type, message}`, Anthropic's included, and because nothing is sent until
the whole loop finishes, a long answer that would have streamed can come
back 504 or 546 instead.

---

## 3. The other Edge Functions

Three functions answer a user and three answer a clock. `chat`,
`add-weather-source` and `ingest-weather` answer their own `OPTIONS`, take
the caller's JWT in `Authorization` and run §1's producer check before
anything else, so all three refuse with the same **401**
`{"error": "Not signed in, or this account has no producer."}` --- an
expired token, a missing one and an account with no producer are
indistinguishable on the wire. `sync-scheduled-weather` (hourly),
`scan-conversations-for-observations` and `embed-scheduled-memory` (every
six hours) are posted to by `pg_cron` through `pg_net`, send no CORS
headers, and authorize an `X-Cron-Secret` header rather than a user JWT:
an HMAC over a five-minute time bucket, minted inside Postgres for each
run and accepted for that bucket and the one before
([`0020`](decisions/0020-scheduled-weather-sync.md)). No client calls
those three.

Any function can also fail with a status its own code never writes --- 503
`BOOT_ERROR`, 504 on timeout, 546 `WORKER_RESOURCE_LIMIT` --- carrying the
platform's body rather than the function's, and possibly an
`sb-error-code` header. Supabase documents the 546 body as
`{"code": "WORKER_RESOURCE_LIMIT", "message": String}`, which has neither
`error` nor `type`.

**`POST /functions/v1/add-weather-source`** --- request is **snake_case**:
`{"provider_id": uuid, "name": String, "station_id": String, "secret": String}`.
`station_id` is the number a producer reads off tempestwx.com; the function
translates it to Tempest's internal device id server-side, calling Tempest
with `secret` as the API key before it inserts anything. It resolves every
station against Tempest whatever `provider_id` says, and the database
accepts any existing provider's id, so the id sent has to be the Tempest
provider's --- the only `weather` provider in `data_providers`. Nothing
checks `name`, and an empty one is stored; the React form refuses any blank
field and sends the typed values untrimmed. Success is 200 `{"id": uuid}`,
which the React client discards entirely --- so nothing in TypeScript
documents it.

After the producer check, **every** failure is a 400 `{"error": String}`,
including "no such station". Never a 404, never a 422. The 401 and the 400
share the `error` key, so only the status tells a lapsed session from a
refused station. The 400's `error` is `String(err)`, so it starts with the
JS class name: `Error: ` for anything Tempest or the database refused ---
a non-2xx from Tempest has Tempest's response body inlined ---
`TypeError: ` when Tempest cannot be reached, and `SyntaxError: ` for a
body that is not JSON. The React form shows it verbatim, prefix included.

**It is single-shot, and a station goes in once.** The credential is stored
in Vault under the name `data_source:<provider_id>:<device_id>`, which is
unique across the whole project rather than per producer, and is not
removed when the source is deleted --- itself possible only before the
source's first readings land, because `weather_observations` references it
with no cascade. So a retry after a lost 200, a re-add after deleting the
source and a second producer adding the same station all get a 400 whose
`error` names `secrets_name_idx`. The new source starts with
`backfill_status` `pending` and `backfill_start` 2019-01-01, and nothing
ingests it immediately: the next top-of-the-hour `sync-scheduled-weather`
run starts the backfill, at up to 25 five-day chunks per source per run.
That sync takes only `enabled` sources that have a stored credential.

**`POST /functions/v1/ingest-weather`** is a loop, not a call, and no
client calls it today --- the React "Sync now" was removed in #101 once the
hourly sync covered it, so a native client needs it only for a "Sync now"
of its own. Body is **snake_case** `{"source_id": uuid}`. It does not check
`enabled`, so a disabled source still syncs on request.

Each call does one chunk. While `backfill_status` is not `complete`, the
chunk is the 5 days ending at `backfill_cursor` (or now, for a new
source), cut short at `backfill_start`, and the cursor moves back to the
window's start; `done` turns true only when a window reaches
`backfill_start` --- an empty window does not end it. Once complete, a call
fetches everything since `last_synced_at` in one request, with no 5-day
cap, and returns `done: true`. Readings upsert on
`(source_id, observed_at)`, so re-running a window is harmless.

Four outcomes, and the status code separates only some of them:

- **200** `{done, rows_processed, backfill_status, backfill_cursor, last_synced_at}`
  --- all five keys present. `backfill_status` is `in_progress` or
  `complete`; `backfill_cursor` and `last_synced_at` are nullable, and the
  latter stays null until a new source's backfill first completes.
- **200** `{done: false, error}` --- the Tempest fetch or the upsert
  failed. The chunk helper returns it and the handler serializes it with no
  status override. From Tempest, `error` is `String(err)`, prefix
  included, with Tempest's body inlined on a non-2xx; from the upsert it
  is the bare PostgREST message. Both are also written to
  `data_sources.last_error`.
- **500** `{done: false, error: String(err)}` --- it failed before the
  chunk: a body that is not JSON, a `source_id` that is not one of the
  caller's sources, or a source with no stored credential (one added
  through `add_data_source` without `p_secret`, which is how React adds
  every non-Tempest source). Not written to `last_error`.
- **401** --- the shared refusal above.

So a 200 is not a success signal here; the absence of `error` is.
`done: false` means *call me again* only when `error` is absent, and a loop
on `done` alone spins against a dead station without ever advancing.
Timestamps the call has just written are JavaScript's `toISOString()`
(`2026-09-22T12:00:00.000Z`); ones echoed from the row are Postgres's
(`2026-09-22T12:00:00+00:00`, with zero to six fractional digits), and a
steady-state response carries one of each. The only implementation of the
loop is `sync-scheduled-weather`'s, which calls the chunk helper in-process
rather than over HTTP, stops a source at its first `error`, and caps it at
25 chunks per run.

---

## 4. PostgREST: tables and RPCs

Thirty PostgREST calls in `app/src/data/`, four of them RPCs. The modules
are the readable reference for column lists and filters, which are not
duplicated here; what follows is what a second client cannot read off
them, including the two jsonb shapes a client writes.

### RPCs

Every RPC is `POST /rest/v1/rpc/<name>` with a JSON object keyed by
argument name, and none is retried (§1).

**Argument types that are easy to get wrong in Swift.**
`create_observation_candidate` takes `p_photo_latitude double precision`,
`p_photo_longitude double precision` and `p_photo_accuracy_m real`. On the
wire all three are plain JSON numbers --- `real` is how the accuracy is
stored, not how it travels --- so all three are `Double`, which is what
`CLLocationAccuracy` already is. The coordinates are kept only as a pair:
send one without the other and neither is stored, while the accuracy is
stored whatever comes with it. Also `p_observed_date date` (§1),
`p_client_id uuid`, and `p_source text default 'producer'`, which a check
constraint limits to `producer`, `photo`, `chat_tool` and `chat_scan`.
Two raises arrive as HTTP 400 / `P0001`: `No producer for this user` and
`A candidate needs a summary`, on a summary that is null, empty or only
spaces. Postgres's `trim()` strips spaces and nothing else, so a summary
of newlines or tabs passes, and the summary is stored with leading and
trailing spaces removed. Its replay branch returns the existing row's id
and inserts nothing --- see §7.

**An omitted argument is not always a null one.** React's `rpcArgs`
(`app/src/data/result.ts`) sends every argument it passes, nulls included,
rather than dropping the null ones, because PostgREST picks the function
by the argument names present. Each RPC has exactly one overload today, so
a body that leaves a `nil` key out --- synthesized `Encodable` does ---
still reaches it and gets the declared default: `null` for every optional
argument except `p_source`, whose default is `'producer'`. An explicit
`p_source: null` is 400 `23502`, because the column is `not null`.

**What each one returns.** PostgREST returns a scalar result bare --- a
JSON string or `null`, not wrapped in an object or an array.

- `create_observation_candidate` → `"<uuid>"`: the new candidate's id, or
  on a `p_client_id` replay the one already filed. Never `null`.
- `confirm_observation_candidate(p_candidate_id)` → `"<uuid>"` of the new
  observation, or `null` when the candidate is no longer `pending` ---
  already confirmed (a replay) or dismissed --- and nothing was written.
  It raises `Candidate not found` and `Not your producer's candidate`.
  React discards the value.
- `confirm_write(p_proposal_id)` → **always a JSON array**, never an
  object and never `null`: one element per row written, each the whole row
  (`returning *`) of whichever table the proposal targets, and `[]` if it
  touched none. The keys vary; the container does not, so
  `[[String: JSONValue]]` is a safe decode target.
- `add_data_source` → `"<uuid>"` of the new source; it raises
  `no producer found for the current user`. React calls it only for a
  source with no credential and never sends `p_secret`: a credential goes
  through `add-weather-source` (§3), which calls the same function under
  the caller's JWT.

**`confirm_write` is not idempotent**, and its error can mean it worked.
It applies a proposal only while its status is `pending` and the caller's
producer owns it, and marks it `applied` in the same transaction. A second
call --- a retry after a lost response --- raises
`no pending write found for this proposal` (400, `P0001`), the same error
a declined, foreign or nonexistent proposal gets. A PostgREST error body
means the call rolled back and changed nothing, so after any other error
the proposal is still `pending`. A lost response, or an error body without
PostgREST's `code`, leaves the outcome unknown, and reading the status
settles it: `GET /rest/v1/pending_writes?id=eq.<id>&select=status` returns
`[{"status": "pending" | "applied" | "declined"}]`, or `[]` for a proposal
that is not the caller's or does not exist.

**Declining is a plain PATCH, and React's can relabel an applied write.**
React sends `PATCH /rest/v1/pending_writes?id=eq.<id>` with
`{"status": "declined"}` and no `Prefer`, which answers 204 whether or not
a row matched. The update policy checks only the producer, and
`authenticated` may update `status`, so a decline that lands after an
apply turns an `applied` proposal `declined` while its data stays written.
The same grant lets `status` go back to `pending`, and `confirm_write`
then applies the proposal a second time. React makes the relabel easy:
each card keeps its state in memory only, so a conversation opened in
History, or continued from it, shows live Confirm and Decline buttons on
proposals applied long ago. The backend already supports the safe form:
add `&status=eq.pending` and send `Prefer: return=representation`, and a
200 with `[]` means the proposal was already resolved or is not the
caller's. The native client's card works that way
([`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md#where-the-native-client-deliberately-differs-from-the-web-one)).
Dismissing a candidate (`PATCH observation_candidates` with `status` and
`reviewed_at`) has the same shape and the same hole: its update policy has
no status predicate either, so a stale dismiss relabels a `confirmed`
candidate `dismissed` while its observation stays.

### Tables

**Writes return nothing unless asked**, and a PATCH or DELETE that
matched no row answers like one that did (§1). In a PATCH body
an absent key leaves the column alone and `null` clears it, so clearing a
value from Swift needs an explicit `encodeNil`.

**A PATCH or DELETE with no filter is refused, not applied to every row.**
`authenticator` preloads `safeupdate`, so an unfiltered UPDATE or
DELETE fails with 400 `21000` (`UPDATE requires a WHERE clause`, or
`DELETE requires a WHERE clause`). Any filter satisfies it: it catches a
builder that drops `id=eq.`, not one that filters on the wrong column.

**React polls `app_status` whether or not anyone is signed in**, every 30s
and whenever the tab becomes visible; `App.tsx` checks for a block before
it checks for a session. It is the switch that stops every client while
someone works directly against production, and it is why `anon` holds a
select grant on that table and nothing else in `public`. Every error is
swallowed and returns nil, deliberately: *not knowing means carry on* ---
a failed poll even lifts a maintenance block already on screen. It uses
`.single()` with no filter, and the table cannot hold a second row ---
`id boolean primary key default true check (id)`. A deleted row would be
a 406 `PGRST116`, swallowed like the rest.

**Poll it with `apikey` alone.** supabase-js sends
`Authorization: Bearer <publishable key>` only when it holds no session;
with one, it sends that session's access token. When PostgREST rejects the
token --- 401 `PGRST30x`, for which a device clock running slow is enough,
since supabase-js judges expiry by the device's own clock --- the poll
fails, returns nil, and the maintenance block never reaches that user,
though `anon` could have read the row. The publishable key as `apikey`
with no `Authorization` header gets the `anon` role and the row: 200
`[{"maintenance":false,"message":null}]`, checked 2026-09-22.

**`conversations` is written by the client, and its shape is part of the
contract.** Two cron jobs and the desktop's History read what a client
writes here; what breaks for each when a rule below is missed is §7.

- `id uuid`, minted by the client and sent on the insert (lowercase, §1);
  React never leaves it to the column's `gen_random_uuid()` default.
- `producer_id uuid not null`, which must be the caller's own: the insert
  policy checks it against `private.current_producer_id()`, and anything
  else is 403 `42501`. React reads it from `profiles.producer_id`.
- `mode text`, checked to `ask` or `submit`. Every write sends `ask`; one
  legacy `submit` row exists, so a decoder needs both.
- `transcript jsonb not null default '[]'`, below.
- `created_at` and `updated_at`, `timestamptz not null default now()`.
- `scanned_at` and `embedded_at`, the two cron jobs' watermarks.

`authenticated` holds INSERT and UPDATE on all eight columns, so only the
client keeps itself from writing `created_at` or a watermark: send `id`,
`producer_id`, `mode`, `transcript` and `updated_at`, and nothing else.
There is no DELETE grant and no delete policy --- a DELETE is 403 `42501`,
and no client can remove a conversation.

**React inserts once, then PATCHes; it never upserts.** The first write is
`POST /rest/v1/conversations` with
`{id, producer_id, mode: "ask", transcript}` → 201. Every later one is
`PATCH /rest/v1/conversations?id=eq.<id>` with
`{mode: "ask", transcript, updated_at}` → 204, and a conversation reopened
from History starts at the PATCH. Writes go out at send, after the
answer, and on every thumb, and each replaces the whole array. A second
insert of one id is 409 `23505`; a PATCH that matches no row is still 204.

**Nothing maintains `updated_at` but the client.** The table's only
trigger is `audit_row_change`, and the column default fires on INSERT
only, so every PATCH carries `updated_at` itself, as an ISO 8601 string
(React: `new Date().toISOString()`). A JSON number --- what `JSONEncoder`'s
default date strategy produces --- is 400 `22008`, which a fire-and-forget
write never surfaces. A PATCH without it saves the transcript but leaves
the conversation where it was in History, which orders by `updated_at`,
and hides the new turns from each cron job that has already read the
conversation (§7).

Conversation saving is to move to a database function --- planned, see
[`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md#conversation-saving-moves-to-the-server).
Until it lands, the writes above are the only write path.

**The transcript is a JSON array of message objects**, never a string
that contains one:

```json
[
  {
    "role": "user" | "assistant",
    "content": "...",
    "feedback": "up" | "down",
    "sources": ["weather" | "vineyard" | "memory" | "phenology" |
                "web" | "photo"],
    "tokens": { "total": <int>, "cached": <int>, "cost": <number> }
  }
]
```

`role` and `content` are always present, and `content` is always a
string: a photo sent with no words is stored as `"I took a photo."`, and
the photo itself never enters the transcript. The other three are optional
and **omitted when absent, never `null`**. React drops `feedback` when a
thumb is toggled off, adds `sources` only when the list is non-empty, and
adds `tokens` only when the answer reported a token count above zero. A
`null` is not harmless: the desktop's chat, resuming a conversation, tests
`tokens.cost === undefined` and renders a `null` cost as "about 0¢".

- `sources` is what the answer looked at, taken from the `tool` start
  events in first-mention order: `execute_readonly_query` is `weather`
  when its `detail` names `weather_observations` and `vineyard` otherwise;
  `search_memory` is `memory`, `get_grape_phenology` `phenology` and
  `view_photo` `photo`. `web` has a label on the desktop but nothing
  produces it, because web search emits no `tool` event (§2).
- `tokens` sums every `usage` event of the answer: `total` is input +
  cache read + cache write + output, `cached` is cache read, and `cost` is
  estimated US dollars, priced when the answer arrived at the rates in
  `app/src/features/chat/cost.ts` (for `claude-sonnet-5`, the `MODEL` in
  `chat/index.ts`). A second client carrying those rates is a second
  place a model change has to reach. `cost` is absent on answers logged
  before it existed.

The database enforces none of this --- `transcript` has no check
constraint --- so a wrong shape is accepted with a 2xx and fails in its
readers later. As stored on 2026-09-22: 74 rows, every transcript an
array and every `content` a string; key sets `{role, content}` 286,
`+feedback` 4, `+sources, tokens` 20, `+tokens` 14; 3 `tokens` without
`cost`.

**The Device location source's `config` is the other jsonb a client
writes:** `{"latitude": <number>, "longitude": <number>, "captured_at":
"<ISO 8601>"}`, sent as `add_data_source`'s `p_config` the first time and
as `PATCH /rest/v1/data_sources?id=eq.<id>` with `{config}` after. The
chat's phenology tool reads `latitude` and `longitude` and refuses to run
without both, and the desktop calls `.toFixed` on them, so they are JSON
numbers, never strings.

**Three kinds of value do not read back the way they look.**

- `timestamptz` arrives in §1's form, with anything from six fractional
  digits to none, and a decoder has to accept every width.
- `geography` --- `photo_location` on `observations` and
  `observation_candidates`, and `planting.location`, all
  `geography(Point,4326)` --- arrives as a 50-character hex EWKB string,
  not GeoJSON and not numbers. Postgres has a JSON cast for `geometry` but
  none for `geography`, so PostgREST writes its text form:
  `0101000020E6100000` (little-endian, point, SRID 4326), then longitude
  and latitude as little-endian doubles. For plantings, read
  `planting_readable.latitude` and `.longitude` (`double precision`)
  instead --- null on all 3,004 plantings on 2026-09-22, because none has
  a location yet. Nothing exposes a photo's location as numbers and React
  never reads it, so a client that shows one decodes the 25-byte point
  itself.
- `observations.photo_metadata` is `text`, and what
  `confirm_observation_candidate` writes there is a storage path,
  `<producer_id>/<uuid>.jpg`, copied from the candidate's `photo_path`;
  React hands it straight to the signed-URL mint (§5). The column began
  as raw EXIF/XMP text and its column comment still says so: the one
  non-null value on 2026-09-22 is a 1,280-character XMP packet from
  2026-09-13, which React labels a photo and cannot display. A value not
  shaped `<uuid>/<uuid>.jpg` is not a path.

### Errors from PostgREST

Every PostgREST error body is `{code, message, details, hint}`, with
`details` and `hint` often `null`. Classify by `code` and status, never by
`message`; the only messages that carry meaning are the `P0001` raises
above. Any code PostgREST does not map is 400. The ones this backend
produces:

| `code` | HTTP | from |
|---|---|---|
| `P0001` | 400 | an RPC's `raise exception`; `message` is its text |
| `23502`, `23514`, `22008` | 400 | a value the column refuses: `p_source: null`, a source outside the check, a JSON number for a `timestamptz` |
| `21000` | 400 | `pg-safeupdate`: a PATCH or DELETE with no filter |
| `23503` | 409 | a foreign key: a candidate naming a conversation not yet written (§7), or a planting that no longer exists |
| `23505` | 409 | a duplicate key: a second insert of one conversation id, or two concurrent candidates with one `client_id` (§7) |
| `42501` | 403, **401 as `anon`** | no grant, or a row RLS refuses to insert: a DELETE on `conversations`, a `producer_id` that is not the caller's |
| `PGRST116` | 406 | `.single()` found zero rows, or several |
| `57014` | 500 | statement timeout: 8s as `authenticated`, 3s as `anon`; not retried (§1) |
| `PGRST301`, `PGRST303` | 401 | a JWT PostgREST will not accept, with `WWW-Authenticate: Bearer error="invalid_token"` |

**A 401 is not always a token problem.** `42501` as `anon` is a 401 too,
and it also carries `WWW-Authenticate: Bearer`, only without `error=`, so
refresh-and-replay keys on `PGRST30x`, not on the status or the header.
And a request with no `apikey` never reaches PostgREST: the gateway
answers 401 `{"message": "No API key found in request", "hint": "..."}`,
with no `code` at all.

### Release notes

**Release notes come from GitHub, not Supabase.** The client fetches the
releases list directly, sets no headers of its own --- no `Accept`, no
token --- takes `releases[0]` as latest, and treats any failure as an
empty list. It is therefore subject to GitHub's 60-request/hour
unauthenticated IP limit, which nothing currently handles.

---

## 5. Storage

One private bucket, `observation-photos`, holds observation photos at
`<producer_id>/<uuid>.jpg`. **The path is the tenancy check** ---
`storage.objects` has no producer column, so all three policies, each `to
authenticated`, compare `private.storage_object_producer(name)` (the first
path segment cast to `uuid`, `null` when it is not one) with
`private.current_producer_id()`. Only that segment is checked; `<uuid>.jpg`
is client convention. `anon` has no policy, so signed out there are no
objects at all.

Object names compare byte for byte (`name COLLATE "C"`) while the tenancy
cast ignores case --- the trap in §1: an uppercase producer folder passes
the policy and names a different object from the lowercase one. On
2026-09-22 all 11 objects are lowercase `<uuid>/<uuid>.jpg`, stored as
`image/jpeg` with `max-age=3600`.

**There is no UPDATE policy, only select, insert and delete.** So
`x-upsert: true` over an existing object is refused (`AccessDenied`, below),
never an overwrite, and the omission is deliberate: replacing bytes in place
would let the evidence behind a confirmed observation change while the row
still reads the same path. A Swift uploader that turns upsert on "to be
safe" gets the opposite of safe. Delete-then-upload under the same name is
allowed, though --- versioning is off on the bucket, so a delete removes
the row outright --- which means a path names one set of bytes only while
names are never reused. React never reuses one: it mints a fresh uuid per
upload (`photo.ts:254`).

### The calls

All under `/storage/v1`, all with `apikey` and
`Authorization: Bearer <access_token>`, the pair PostgREST takes.

**Upload** --- `POST /object/observation-photos/<path>`. `storage-js`
2.116.0 sends a `Blob` as multipart `FormData` (fields `cacheControl` =
`3600`, `metadata` as a JSON string when given, the file under an empty
name) and **ignores the `contentType` option**: the object's type is the
Blob's own. A raw-body upload sets it all itself --- `Content-Type:
image/jpeg`, `cache-control: max-age=3600` (without it the object stores
`no-cache`), `x-upsert: false` (absent means the same), and metadata as
`x-metadata: <base64 of the JSON>`. Metadata that does not decode is dropped
silently, not rejected. Success is a 200
`{"Id": uuid, "Key": "observation-photos/<path>"}`.

Metadata lands in `storage.objects.user_metadata`. The chat path sends
`PhotoExif` (`exif.ts:22-26`) when the photo has any: `dateTimeOriginal`,
the EXIF date string as written (`YYYY:MM:DD HH:MM:SS`, camera-local; in the
shell it falls back to `DateTimeDigitized`, `CreateDate` or `DateTime`,
`photo.ts:181`), and `gpsLatitude` / `gpsLongitude` as signed decimal
degrees. The queue path sends none (§7). On 2026-09-22 six objects hold
`{dateTimeOriginal}`, five hold `{}`, and none carries the GPS keys.

**Sign** --- `POST /object/sign/observation-photos/<path>`,
`{"expiresIn": 300}`, returns
`{"signedURL": "/object/sign/observation-photos/<path>?token=<jwt>"}`.
**`signedURL` is relative to `/storage/v1`, not the project root**: the URL
to fetch is `<base>/storage/v1` + `signedURL`. Fetching it takes no headers;
the token is the credential.

**Batch sign** --- `POST /object/sign/observation-photos`,
`{"expiresIn": 300, "paths": [...]}`, returns a 200 array of
`{error, path, signedURL}`. A path that is missing or not the caller's is an
element with `signedURL: null` and `error: "Either the object does not exist
or you do not have access to it"` --- a per-item failure inside a 200.

**Remove** --- `DELETE /object/observation-photos` with
`Content-Type: application/json` and `{"prefixes": ["<path>"]}`, exact names
despite the key. It returns a 200 array of the rows it deleted; a path that
is missing or not the caller's is simply absent. **An empty array is a
delete that did nothing, not an error.**

What React does with these is client behaviour. Signed URLs are minted per
photo, uncached, at 300s, so a log with N photos is N sign requests, and the
batch endpoint is never used. `deletePhoto` ignores remove's result, so a
failed delete is silent (`photo.ts:274-276`). And **nothing in storage
retries**: `storage-js` has no retry, so §1's read retry is PostgREST's
alone and a sign is as single-shot as an upload.

### Errors: HTTP 400, with the real status in the body

Storage sends every error it raises as **HTTP 400** unless the status it
means is exactly 500 --- a 403, a 404, a 409 and even a 503 all arrive as
400 --- and puts the status it means in the body's `statusCode` as a
**string**, beside `code`, `error` and `message`. The exceptions are two the
source sets explicitly (429 under database connection pressure, 544 on a
database timeout) and errors the framework raises before storage's own code
runs, which keep their status (`src/http/error-handler.ts`). `storage-js`
copies the body's value into its error's `statusCode` and the 400 into
`status` (`lib/common/fetch.ts:78-80`), and `app/src` reads neither, so
nothing in React shows the split. Supabase's error-code page lists the
intended statuses (`InvalidJWT` 401, `KeyAlreadyExists` 409), not the
wire's. Decode by body, never by HTTP status:

| case | `statusCode` | `code` | `error` | `message` |
|---|---|---|---|---|
| bearer expired or malformed | `"403"` | `AccessDenied` | `Unauthorized` | the JWT verifier's |
| upload refused by policy: another producer, a non-uuid first segment, upsert over an object | `"403"` | `AccessDenied` | `Unauthorized` | `new row violates row-level security policy` |
| name taken, `x-upsert: false` | `"409"` | `KeyAlreadyExists` | `Duplicate` | `The resource already exists` |
| sign a path that is missing *or not the caller's* | `"404"` | `NoSuchKey` | `not_found` | `Object not found` |
| fetch a signed URL with an expired or bad token | `"400"` | `InvalidJWT` | `InvalidJWT` | the JWT verifier's |

**An expired access token is never a 401 here.** It is an HTTP 400 carrying
`AccessDenied`, the same `code` as a real tenancy refusal and told apart only
by `message`. A "refresh on 401" rule never fires for a photo, and a queue
that parks every 4xx as permanent parks a photo whose only fault was an old
token. Refresh before a storage call when the token is near expiry, and
treat one `AccessDenied` as refresh-and-retry-once before believing it.

**Match a duplicate on `error` `"Duplicate"` with `statusCode` `"409"`,
never on `code`.** Which `code` a duplicate carries depends on the code path
inside the server: a unique violation maps to `ResourceAlreadyExists`,
`createObject` rewraps that as `KeyAlreadyExists` (`pg.ts:1230-1231`), and
`completeUpload` throws `KeyAlreadyExists` directly. Both carry `Duplicate`
and `"409"`, and Supabase's error-code page lists both.

Provenance, because none of this is visible from a client: the HTTP 400
envelope and the malformed-bearer, `NoSuchKey`, `InvalidJWT` and
batch-element shapes were observed live on 2026-09-22 with no user token,
against storage 1.77.5 (its `/version`); the verifier's message for a
malformed token is `Invalid Compact JWS`. The expired-token, policy and
duplicate rows are read from `supabase/storage` at v1.77.5
(`src/http/plugins/jwt.ts`, `src/http/error-handler.ts`,
`src/internal/errors/storage-error.ts`, `src/storage/database/errors.ts`
and `pg.ts`). Confirm the policy and duplicate rows with a user token before
a client branches on them: re-upload one of the producer's own objects with
`x-upsert: false`, then `true`. Both are refused at the permission check
before anything is stored (`src/storage/uploader.ts`, `canUpload`), so
neither writes.

### What the bytes must be

The bucket sets no `allowed_mime_types` and no `file_size_limit` --- only
the project-wide upload cap applies --- so storage accepts any type. The
model does not. The chat function signs `photoPath`, and every `view_photo`
path, for 300s under the caller's JWT and hands Anthropic the URL
(`chat/index.ts:434-446, 1130-1136`), and Anthropic's vision docs accept
only JPEG, PNG, GIF and WebP, up to 8000px a side and 10 MB. A HEIC uploads
cleanly and then fails the model call that carries it: an `error` event
after the 200 on the streaming path (§2), a 500 on the buffered one. A
`photoPath` that will not sign --- missing, or another producer's --- is a
500 before any spend; a `view_photo` path that will not sign becomes an
error tool result the model reads (`index.ts:1012-1015`). **So JPEG
conversion is required by the model, not a preference;** the 1600px long
edge and quality 0.82 (`photo.ts:19-25`) are cost and upload-size choices.

React does not guarantee the JPEG. `downscale` returns the original Blob
untouched when its long edge is already 1600px or less (`photo.ts:29-30`),
and the Blob's own type is what storage records, so a small non-JPEG picked
through the web file input (`photo.ts:226-240`) would be stored as itself
under a `.jpg` name. In the iOS shell it cannot happen only because the
Capacitor camera plugin re-encodes every capture and pick to JPEG first
(`CameraPlugin.swift:400,449`). The native client has no such plugin, so
[`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md)
has it always re-encode, name each photo at capture and write the same
metadata on every upload path.

**Unreferenced is normal, not orphaned.** On 2026-09-22 eight of the 11
objects are named by no `observation_candidates.photo_path` or
`observations.photo_metadata`, and seven are named nowhere, not even in a
transcript. A chat photo's path is shown to the model for one request and
is not saved with the producer's turn (`Chat.tsx:93-104`), so unless it is
filed as an observation or an answer happens to quote it, nothing points at
it. Nothing may garbage-collect by that test.

---

## 6. Auth

The web app signs in by browser redirect (`signInWithOAuth`,
`LoginForm.tsx:21`). The Capacitor shell instead exchanges a Google ID
token for a Supabase session (`signInWithIdToken`, `nativeAuth.ts:91-95`).
From then on every client holds the same pair --- a short-lived access
token and a rotating refresh token --- and refreshes and signs out through
the same endpoints. Where the native client deliberately differs from the
React one (its sign-out scope, the refresh rules it tests), the reasons are
in [`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md).

### Getting a Google ID token

**The nonce goes in two forms.** The SHA-256 digest of the raw value, as
lowercase hex, goes to Google and lands verbatim in the `id_token`'s
`nonce` claim. The raw value goes to the `id_token` grant, where GoTrue
hashes its bytes the same way and compares; a difference is
`Nonces mismatch`. The raw value's format is free and the digest's is not.
Omitting the nonce does not opt out: AppAuth then mints its own, which we
never see, and GoTrue refuses a token that carries a nonce when none was
passed, with
`Passed nonce and nonce in id_token should either both exist or not.`
Mint a fresh one for every attempt.

**Never exchange a restored or refreshed Google `id_token`.** Neither was
issued against this attempt's nonce: a restored token carries the one from
the interactive sign-in that first produced it, which is where the shell's
`Nonces mismatch` came from (`nativeAuth.ts:74-80`). The shell's plugin is
where this bites: unless called with `forcePrompt: true`,
`@capgo/capacitor-social-login` answers with `restorePreviousSignIn` and
`refreshTokensIfNeeded` whenever GoogleSignIn has a previous sign-in, and
returns whatever token those give it. `forcePrompt` is the plugin's flag,
not part of the contract. The rule under it is: exchange only the token
from an interactive sign-in made with this attempt's nonce.

**The token's audience is the web client.** GoTrue accepts a Google
`id_token` only when its `aud` is in the Google provider's Client IDs
list, and otherwise refuses it with
`Unacceptable audience in id_token: [...]`. GoogleSignIn sends its
configured `serverClientID` to Google as `audience`, and Google issues the
`id_token` with that as its `aud`. The shell sets `serverClientID` to the
web client id (the plugin calls it `iOSServerClientId`, `nativeAuth.ts:37`),
so its tokens carry the web client as `aud`. The hosted Client IDs list,
read on 2026-09-22, holds the web client first and the Capacitor iOS
client second. **The native iOS client is not in it and does not need to
be**, as long as `serverClientID` is the web id. Without that, `aud` is
the native client and the exchange is refused.

**"Skip nonce checks" is off** (read 2026-09-22), which the two errors
recorded in `nativeAuth.ts` already implied: GoTrue raises both only while
nonce checks run. Supabase's own iOS guide says to add the iOS client id
to the Client IDs list and to turn "Skip nonce check" on. **Do not follow
it here.** The first edit is unnecessary for the reason above, and the
second removes the replay protection the two-form nonce exists to provide.

### Auth wire calls

Hosted GoTrue is v2.197.0 (`GET /auth/v1/health`, 2026-09-22). Every call
sends `apikey: <publishable key>`, `Content-Type: application/json`
(auth-js appends `;charset=UTF-8`) and
`X-Supabase-Api-Version: 2024-01-01`. supabase-js also sends the
publishable key as `Authorization: Bearer` on the two grants; GoTrue does
not need it there.

- **Sign in.** `POST /auth/v1/token?grant_type=id_token` with
  `{"provider": "google", "id_token": "<Google id_token>", "nonce": "<raw nonce>"}`.
  auth-js also sends `"gotrue_meta_security": {}`, and a Google
  `access_token` when given one; the shell gives none. GoTrue accepts that
  today, but logs a warning that `access_token` will become mandatory for
  an `id_token` that carries `at_hash`.
- **Refresh.** `POST /auth/v1/token?grant_type=refresh_token` with
  `{"refresh_token": "<refresh token>"}`.
- **Sign out.** `POST /auth/v1/logout?scope=local|global|others` with
  `Authorization: Bearer <access_token>` and no body. Success is **204 with
  an empty body**. `local` ends this session, `global` every session the
  user has, `others` all but this one; no `scope` means `global`, and any
  other value is 400 `validation_failed`. With no bearer it answers 401
  `no_authorization`; with one it cannot verify or that has expired, 403
  `bad_jwt`; with one whose session is already gone, 403
  `session_not_found`.

Both grants succeed with 200 and
`{access_token, token_type: "bearer", expires_in, expires_at, refresh_token, user}`.
`expires_at` is Unix seconds. v2.197.0 always sends it; auth-js derives it
from `expires_in` for a server that does not.

**Errors come in three bodies, and the version header picks between two
of them.** With the header, an ordinary error is
`{"code": "<error_code>", "message": String}` and the response echoes
`X-Supabase-Api-Version`. Without it the same error is
`{"code": <HTTP status>, "error_code": String, "msg": String}`, where
`code` has changed type, so always send the header. Either way the code is
repeated in an `x-sb-error-code` response header. The `id_token` grant's
token, audience and nonce failures keep one body whatever the header says:
they are OAuth errors, always **HTTP 400**
`{"error": String, "error_description": String}` with no
`x-sb-error-code`. `error` is literally `"invalid request"`, with a space,
or `"invalid nonce"`; the reason is in `error_description`.

### Keeping a session

**The hosted session settings are §1's table**, read from the dashboard
rather than `config.toml`. With single session per user off, a web session
and a phone session coexist. Take expiry from `expires_at` or the JWT's
`exp`, never from a constant.

**Rotation, exactly.** An ordinary refresh revokes the token it was given
and returns a new one. GoTrue then forgives two kinds of reuse:
- the **parent of the currently active token**, at any age: GoTrue hands
  back the active refresh token instead of minting another --- the case of
  a client that never stored the last response;
- **any** revoked token presented within 10s of its revocation.

Anything else --- in practice a token two or more rotations behind,
presented more than 10s after it was replaced --- revokes every refresh
token in the session and fails with 400 `refresh_token_already_used`.
Once that revocation is 10s old, nobody holding that session can refresh
again. A client that loses one rotation recovers; one that loses two is
signed out, and so is every other client sharing its session, which is why
two clients must never share a refresh token. These are the rules for
GoTrue's 12-character, row-backed refresh tokens, which every row in
`auth.refresh_tokens` is (3 active, 25 revoked on 2026-09-22). Its longer,
counter-based format, not issued here, forgives a token one step behind or
any token within 10s of the session's last refresh, and otherwise deletes
the whole session.

**A 400 naming the token is a signed-out session.** Every rejection of the
token itself is HTTP 400: `refresh_token_not_found`,
`refresh_token_already_used`, `session_not_found`, `session_expired`,
`user_banned`, and `validation_failed` for a malformed or truncated token.
Two other answers say nothing about the session: 400 `bad_json` is a
request body GoTrue could not parse, and 429 `over_request_rate_limit` is
GoTrue's per-IP limiter on every `/token` grant. Transport failures and
5xx keep the session. auth-js, for comparison, shares one in-flight
refresh between callers; retries network errors and 500-504/520-530 with
a backoff that doubles from 200ms for as long as the next attempt starts
within 30s; treats every other status (429 included) as final; drops the
session on a final failure only once the access token has actually
expired; and for 60s hands the same failure to any caller holding the same
refresh token instead of asking again.

**React refreshes implicitly.** `createClient` runs with its defaults
(`supabaseClient.ts:18`), so the session persists in `localStorage` under
`sb-fostmbhpnhjzhulphxzp-auth-token` and refreshes itself twice over: a
30s ticker refreshes once fewer than 120s of validity remain, and the
`getSession()` that runs before every request refreshes once fewer than
90s remain. No growdy source calls a refresh.

**Refresh before a chat send, not at 90s.** The chat call takes its token
from that same `getSession()` (`chat.ts:106`), so a token sent with 91s
left can expire mid-answer, which fails only as `tool` errors inside an
ordinary 200 (§2). Refresh before sending whenever less than the 150s wall
clock plus a margin remains. The React client does not.

**Which answer means "token rejected" depends on the surface**, and §1
sets out each: PostgREST's 401 `PGRST30x`, the functions' 401 that only a
`profiles` read can explain, and storage's HTTP 400 `AccessDenied` (§5).

**React's sign-out is global.** `supabase.auth.signOut()` defaults to
scope `global`, and the app calls it with no argument (`SignedIn.tsx:112`,
`NoProducerScreen.tsx:16`). Signing out of the web app or the shell
therefore ends every session the user has, the phone's included. Access
tokens already issued stay valid until their `exp`, because PostgREST
checks the signature and expiry rather than the session row, so the phone
finds out at its next refresh, up to an hour later, as 400
`refresh_token_not_found`: the refresh tokens are deleted with their
sessions. auth-js clears its own local session whatever `/logout`
answers.

### The Google clients

**Bundle-bound, and therefore not portable as-is:** Google binds iOS OAuth
clients to a bundle identifier --- the console offers exactly one Bundle ID
field per client, with no way to add a second --- and the reversed client
id is a URL scheme in `Info.plist`. A native client under a new bundle id
needs its own OAuth client. The web client id is not bundle-bound and
carries over, because it is passed as `serverClientID` to set the token's
audience rather than to identify the app. Sign in with Apple needs a paid
Apple Developer team and is unavailable today
([`0029`](decisions/0029-ios-shell-and-native-sign-in.md)).

The three clients, all in Google Cloud project `growdy`
(`composed-circle-508504-c8`, project number `839193339289`):

| Bundle id | Client | Client id |
|---|---|---|
| none (web application) | Growdy web client | `839193339289-jsfodda8odv1oljrk029tashuv4i471m` |
| `com.growdy.app` | Growdy iOS client | `839193339289-8vcgecqrrbbvh5npa8j4v3qquk25hr9s` |
| `com.growdy.native` | Growdy native iOS client | `839193339289-suqq9v531undphp47aknjrgvtgrricup` |

Every full client id ends in `.apps.googleusercontent.com`, dropped here.
An iOS client's URL scheme is its id without that suffix, reversed onto
`com.googleusercontent.apps.`; the shell's is
`com.googleusercontent.apps.839193339289-8vcgecqrrbbvh5npa8j4v3qquk25hr9s`
(`app/ios/App/App/Info.plist:28`). GoogleSignIn looks for it when sign-in
starts and raises `NSInvalidArgumentException` if it is missing, so a
wrong scheme builds cleanly and crashes at the tap. **None of these are
secrets** --- an iOS OAuth client has no secret, which is the whole reason
the nonce dance above exists; an iOS client id ships in its app's
`Info.plist`, which any user can unzip, and the web id is compiled into
the shell's JavaScript.

**The consent screen is in Testing** (read 2026-09-22), so only listed
test users can sign in at all --- today `seth@` and `sara@sethsara.com`,
against a lifetime cap of 100. Test users are a property of the consent
screen and not of a client, so a new client inherits the list and needs
nothing done to it. Publishing would require completing the Branding page,
and nothing needs that yet.

---

## 7. Contracts that are not requests

The most dangerous part of this document, because none of it is visible in a
network trace and all of it is load-bearing.

**The offline queue ([`0037`](decisions/0037-what-happens-with-no-signal.md)).**
Every capture made in the observation form goes to the queue first and the
queue is flushed immediately --- there is no "send, and queue on failure"
branch. The offline path and the online path are the same code, which is the
whole point: the fallback is never a path only exercised where nobody is
watching. The form is the only caller of `capture()`, and it passes no photo
and no location; the chat's card does not use the queue at all (below).

- `clientId` is minted at capture and is **the idempotency key**.
  `create_observation_candidate` returns the already-filed row's id rather
  than inserting again, scoped to `client_id` *and* `producer_id`, backed by
  the unique index `observation_candidates_client_id_key`. That is what makes
  flushing the same item twice safe. The replay runs only when `p_client_id`
  is non-null --- without it every call inserts --- and it is a select
  followed by an insert, not one atomic step: two concurrent calls with one
  `client_id` leave the loser with `23505`, which PostgREST returns as 409.
  A 409 whose `code` is `23505` means *already filed*, not failed. A 409
  with `23503` names a row that does not exist: the conversation (below),
  or a planting deleted since the capture.
- The flush delivers in `queuedAt` order and **stops at the first failure**,
  so one bad minute does not burn the attempt counter on the whole queue.
- Give up after 5 attempts --- but a stuck item is **never dropped**. It stays
  visible as stuck, because a queue that drops things quietly is worse than no
  queue. In React it is also **never tried again**: the flush skips stuck
  items, nothing resets `attempts`, and the manual "Try sending now" runs the
  same flush. Every failure counts, a no-signal one included. The native
  client counts only a server's rejection and offers Try again and Delete
  (`0037`'s update, and
  [`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md)).
- The uploaded `photoPath` is written back to the queue item *even on the
  failure path*. Without that, each retry orphans another copy of the photo.
  It does not close the gap: the object name is minted per upload attempt
  (`<producer_id>/<random uuid>.jpg`), so an upload that landed but whose
  response was lost is uploaded again under a new name on the next flush,
  and the first copy is orphaned. The native client fixes the name at
  capture (`0039`).
- GPS is captured at capture time, never at flush. *A point taken at flush is
  a lie about where the vine is.*
- Known asymmetry: **a queued photo loses its EXIF**, because the queue path
  uploads with no metadata while the chat path sets it, and the queue item
  has no field to carry it. The keys the chat path
  writes, and what the bucket holds, are in §5.
- React flushes on capture, when the form or the observation log opens, on
  window `online` while one of them is open, and from "Try sending now".
  Every flush returns without trying until that screen's network lookup of
  `producer_id` has succeeded, and the form cannot capture at all until
  then --- although only the photo's object name needs it: the RPC
  resolves the producer from `auth.uid()`.
- Only the button is single-flight, so automatic flushes can overlap: both
  upload the same photo, and the loser's `23505` is counted as a failed
  attempt and can put the filed item back in the queue until the next flush
  replays it.
- **The queue has delivered nothing in production.** It shipped in `0.15.0`;
  on 2026-09-22 none of the 16 candidates carried a `client_id`. No caller
  passes a photo or a location, so its photo, write-back and location paths
  run only in `observationQueue.test.ts`.

**The chat's "Send for review" card bypasses the queue.** The button on a
`log-observation` block calls `create_observation_candidate` directly:
`p_summary` and `p_note` are both the trimmed `note`, `p_source` is `photo`
when a photo path resolves and `chat_tool` otherwise, `p_conversation_id` is
the conversation's id, and **`p_client_id` is `null`**. So it has no replay
protection. After an error the button is live again, and pressing it after a
request that landed but lost its response files a duplicate. The card does
not remember filing (below), so the live chat after its next re-render,
History and a resumed chat all show a filed card as a fresh "Send for
review", and pressing it files again. The native client sends it through
the queue with an id derived from the conversation, the message and the
card (`0039`).

**A candidate's conversation row must exist first.**
`observation_candidates.conversation_id` references `conversations(id)` and
is not deferrable. The RPC is `SECURITY DEFINER` and passes
`p_conversation_id` through unchecked, so the foreign key is the only check:
a candidate naming a conversation with no row fails with `23503`, which
PostgREST returns as 409. React hits it whenever a chat's conversation row
was never written --- every log-observation card in a new chat whose
producer lookup failed (below) fails this way. A client that queues both
must deliver the conversation first.

**The fenced-block protocol is a wire format, not rendering.** The model emits
JSON inside a fence tagged `confirm-write` or `log-observation` and the client
turns it into a button. `confirm-write` requires a string `proposal_id`;
`log-observation` requires a non-blank `note`, with optional `observed_date`,
`planting_id`, `photo_path`. A block that fails those checks renders as its
raw text, and every other fence tag as an ordinary code block. Two pieces of
state live only on the client and must be reproduced or the buttons file
wrong data: the last photo path fills in a `photo_path` the model cannot know
(the model's own wins), and a client-side map from path to
`{location, takenOn}` supplies the coordinates and the fallback observed
date. Both live in the mounted chat's memory. History passes neither, and a
resumed chat starts with both empty, so a card pressed there files only what
its block says. Device position is read at **send**, and only for camera
captures --- a library pick keeps the GPS from its own EXIF, with
`p_photo_accuracy_m` null.

**Neither card remembers what it did.** `MessageContent` builds its
renderers afresh on every render, so each card is remounted in its first
state whenever the chat re-renders --- one keystroke in the compose box is
enough. A filed "Send for review" is live again and files a second
candidate; an applied or declined write offers Confirm and Decline again.

**The fences are stored.** An assistant message's `content` is the final
text byte for byte --- `done.text`, or the buffered body's `text` ---
fences included; React falls back to the concatenated deltas when the
stream brings no `done` or an empty one (§2). The model reads it back as
its own words on the next turn, both cron jobs read it, and desktop History
renders its blocks as live cards against the stored conversation id. A
client that stores a cleaned or rendered form loses those cards on the
desktop and changes what the model and the jobs see.

**Upload on attach, delete on remove.** The photo uploads the moment it is
attached, not when the turn is sent, and the object is deleted if the producer
backs out. A client that uploads at send changes a latency profile that was
chosen on purpose; one that uploads at attach and skips the delete leaks
unreferenced objects into a bucket nobody can see. React deletes only from
the remove button and ignores the result, and attaching a second photo over
a pending one does not delete the first. Removing leaves the last photo path
in place, so a later card with no `photo_path` of its own files the deleted
object's path. A sent chat photo is referenced by no row unless a card
files it, so an unreferenced object is normal, not garbage (§5).

**Transcript persistence is fire-and-forget, and it does not always heal.**
React writes the whole transcript at send, after the answer, and on every
feedback toggle, never awaited and never reported: the first two end in
`.catch(() => {})`, and the feedback write is not caught at all. A `started`
flag picks between §4's insert and PATCH, set only *after* the insert
resolves, so a failed insert is simply tried again by
the next write rather than turning every later write into an update of a row
that does not exist.
Each write carries the whole transcript, so one that never arrived is
repaired by the next --- which is why React absorbs these errors on
purpose, and a client that surfaces them reports failures React never
shows. Two failures are not repaired, and nothing on screen says so:

- **The insert lands but its response is lost.** `started` stays false, so
  every later write is another insert of the same id and fails with `23505`
  as a 409, unseen. The row keeps what the first write held --- normally
  just the first user turn --- for as long as that chat stays open.
- **The `producer_id` lookup at mount fails.** Every write is skipped for
  the life of that chat: nothing is saved, and its log-observation cards
  fail on the foreign key above.

**The client writes conversation history; the server never does** --- and two
backend features depend on it. Per
[`0011`](decisions/0011-conversation-history.md) the client generates the
conversation id and rewrites the whole transcript after each message, with no
involvement from the `chat` function. Two `pg_cron` jobs, each every six hours
(`0 */6 * * *`), then read that table through
`scan-conversations-for-observations` and `embed-scheduled-memory`. So a
client that talks to `chat` and never writes `conversations` does not merely
lose its own history screen --- it **silently switches off observation
scanning ([`0030`](decisions/0030-every-observation-through-one-queue.md))
and producer memory
([`0023`](decisions/0023-producer-memory-via-embeddings.md))** for whoever
uses it. Nothing fails; the features just stop happening.

**`updated_at` is the trigger, and the client sets it.** The jobs select
`where scanned_at is null or updated_at > scanned_at` and the same on
`embedded_at`. Only the client moves `updated_at` (§4), so
the new turns of a `PATCH` without it are not scanned or embedded until
some later write moves it. Every write that does move it gets the
whole transcript re-classified and re-embedded on the next run, a feedback
toggle included, and nothing dedupes the scan's output: a rescan can file
a second `chat_scan` candidate for the same conversation, as one
conversation already has. The columns and the message shape are in §4.

**The watermarks are stamped after the work.** The scan sets `scanned_at`
from the function's own clock once the model has answered and any
candidate is filed; `embedded_at` is set to `now()` inside
`replace_conversation_embeddings`, after the Voyage call. `updated_at`
comes from the client's clock. So a write that lands during a run, or from
a device whose clock is behind, falls below the new watermark and is
skipped until the conversation is written again. That is a backend
property, recorded so a missing scan is not blamed on a client.

**Three readers, three ways to break.** The two jobs and desktop History read
the same rows, and the table checks nothing about `transcript` beyond it
being non-null `jsonb`:

- Both jobs take `order by created_at asc limit 20`. A `transcript` that is
  not a JSON array throws in the embed job. In the scan only a non-empty
  JSON string --- the double-encoding mistake --- throws; any other
  non-array is stamped as scanned without being read. A row that throws is
  not stamped, so it is picked again next run ahead of everything newer:
  twenty such rows end conversation embedding for good, and twenty JSON
  strings end scanning too, while every run still returns 200 with the
  failures in an `errors` array ([`monitoring.md`](monitoring.md) §5).
  Within a message, the jobs accept `content` as a string or a text-block
  array and read anything else as empty.
- History labels each conversation by calling `.find` on its `transcript`
  and rendering the first user message's `content`; it renders user content
  raw and assistant content through `react-markdown`. A non-array
  `transcript`, or `content` that is a block array or other object, throws
  during render, and with no error boundary anywhere in `app/src` that
  unmounts the whole app. When the bad value is in the list's label,
  History cannot be opened at all.

**Resuming re-sends history verbatim.** "Continue this chat" seeds the live
chat with the stored transcript, and every later request sends all of it as
`{role, content}` --- nothing trims, merges or drops a message. Three stored
assistant messages have `content` `""` (from 2026-09-15 and 16, one of them
mid-conversation), so resent history can carry empty assistant turns.

**Every client polls `app_status.maintenance`**, for the reason in §4: it is
the only thing that can stop a client while someone works directly against
production.

**The unsent-chat retry** is a different mechanism from the buffered fallback.
On any failed send the whole request --- transcript, `photoPath`,
`photoTakenOn` --- is held in the mounted chat's memory, **not stored**: a
reload, New chat or a reopen from History loses it. It is re-delivered
automatically on window `online`, which fires only on an offline-to-online
transition, so a failure while the browser still believes it is online is
retried by itself only if the connection later drops and returns; "Try
again" is offered beside the failure message. Because `photoPath` is
carried, the retry does **not** re-upload the photo. The user turn is saved
at send, so until a retry lands the stored transcript ends on an unanswered
question, and asking something else instead sends that question too, as
two user turns in a row. The native client keeps the request on disk and
sends it by itself only after a transport failure (`0039`).

---

## 8. What does not port

**The stale-version check has no native analogue, and only ever worked
where Vercel serves the page.** `useAppStatus` runs one `check()` at mount,
every 30s and whenever `visibilitychange` reports the page visible. It
fetches `/` with `cache: 'no-store'`, scrapes
`<meta name="app-version" content="...">` out of the HTML and compares it
to the running build's `VITE_APP_VERSION`; a mismatch between two non-empty
stamps blocks the app on "A new version is available." with a Refresh
button that reloads the page. The stamp is the build's Unix time
(`VITE_APP_VERSION=$(date +%s)` in `app/package.json`), not a hash of the
code, so every production deploy blocks every older open tab at its next
check, even when the code is identical; `app/vercel.json`'s `ignoreCommand`
skips the build when nothing under `app/` changed since the last deployed
commit. Wherever Vercel serves the page --- a desktop tab, or the web app
in Safari or on the phone's home screen --- this is the only thing that
tells a producer their app is running old code.

**It has never worked in the iOS shell.** `app/capacitor.config.ts` sets
`webDir: 'dist'` and has never had a `server` key, so the shell's web view
loads the copy of `dist/` inside the app bundle, and Capacitor answers
`fetch('/')` with that copy's `index.html`. The two stamps are equal by
construction: `npm run build` writes one value into both the JS and
`dist/index.html`, and `npx cap sync ios` copies them into the bundle
together. The shell's own bundle version is `1.0 (1)` on every build, and
nothing in the web layer displays `VITE_APP_VERSION`, so nothing in the
shell says which build is running. A native app has no `index.html` to
re-fetch either.

**The maintenance half of the same check does port.** `check()` reads
`app_status` (§4) alongside the version and tests it first:
`maintenance = true` wins over a stale version and shows `message`, or
`Down for maintenance -- back shortly.` when that is null. A failed fetch,
or a page with no stamp, counts as no block for its half. The block is
re-decided from scratch on every check, so the maintenance screen lifts
itself once the flag goes false --- and also, until the next check,
whenever one read of the flag fails. `App.tsx` returns the blocked screen
before it looks at the session, so it covers the sign-in screen too. It is
the switch CONTRIBUTING says to flip before a migration or a direct fix
against production (§4). The native client replaces the version half and
keeps this one
([`0039`](decisions/0039-how-the-native-client-is-built-tested-and-delivered.md),
"How it reaches the phone").

**Nothing subscribes to Postgres changes.** Neither the client nor any Edge
Function opens a Realtime channel --- there is no `.channel()` call in
`app/src` or `supabase/functions` --- and the live `supabase_realtime`
publication holds no tables (checked 2026-09-22), so a `postgres_changes`
subscription would receive nothing until a migration adds one. The
`onAuthStateChange` subscription in `App.tsx` is a callback in auth-js's
own in-memory emitter, not a Realtime connection. The native client
inherits no contract here and is free to choose.
