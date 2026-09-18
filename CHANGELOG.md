# Changelog

All notable changes to this project are documented here, one entry per
release. Each entry leads with the theme -- why that batch of changes
happened -- and keeps that why in view through every paragraph, not
just the opening line: the what supports the why, it isn't the point
of the sentence on its own. Prose, not a categorized list. Versioning
follows [Semantic Versioning](https://semver.org/).

Not one release per PR -- see [CONTRIBUTING.md](CONTRIBUTING.md) for what
actually triggers a release and the full process.

This file is the engineering record -- it's never shown in the app. The
GitHub Release published alongside each entry here carries its own,
separate short bullet list written for the producer using the app; that's
what actually shows up as "What's new."

## [0.13.0] - 2026-09-18

The first full UAT pass, and it removed more than it fixed -- then, in
the same batch, the app grew a second front end nobody can reach yet.
Every producer-facing claim from `0.1.0` to `0.12.0` was regrouped by
feature area and walked through against live production -- around forty
checks, twenty-five of which passed. The point of doing it before
continuing the project was to find out which of the things the release
notes claimed were actually true, and the answer for three features was:
nobody had ever used them, and two of them nobody could have.

Two real bugs first, because they were breaking the app for its one real
producer. Giving a reply a thumbs up or down permanently broke its own
conversation: the thumb writes a `feedback` field onto the message in
state, `Chat.tsx` posted the whole message array to the chat function,
and the function passed it to the Anthropic API verbatim, which rejects
any key it doesn't know. The *next* message came back `400`
("messages.1.feedback: Extra inputs are not permitted") and surfaced as
the opaque "Edge Function returned non-8xx status code" -- which is why
it read as random rather than as a thumb. It outlived the session too,
since feedback is saved into the stored transcript, so reopening a
thumbed conversation from history and typing crashed identically, for
good; three conversations were in that state. Narrowed to role/content
at both ends, which fixes the stored ones without touching the rows. The
second bug is the one `0022`'s whole design exists to prevent: on the
write tool's first real outing in production, the chat reported a memory
entry as saved eight seconds before the actual row landed -- one row
existed where the chat had described two. The instruction not to do that
was already in the tool description and wasn't enough, because the dry
run hands back the row the statement *would* write, generated id and
timestamps included, which reads exactly like a row that already exists.
The result now carries `"applied": false` and says so in the payload,
next to that row, where it can't be skimmed past.

Then the removals ([`0028`](docs/decisions/0028-what-uat-removed.md)),
which are the actual substance of this batch. The review gate on
observations went, and it deserves naming precisely because it looked
fine from the outside: every observation in production is `approved`, set
by the column's own backfill when it shipped, and not one row was ever
`pending`, because there was no `UPDATE` grant or policy that could move
one -- the migration that added it said as much in a comment and left
approving "for later." What `0.3.0` announced to producers by name as
"held for review" was a gate with no gatekeeper; a chat-logged field
note would have sat pending forever, never counting as the research data
`0008` wants. It's replaced by the opposite arrangement: observations
count when logged, and a producer deletes what they don't want from a new
observation log. That's only a safe trade because `0022`'s audit trigger
writes the whole old row into `audit_log` on delete, so the correction is
reversible in a way "never approved" never was -- and if that trigger is
ever dropped, this decision needs revisiting.

The onboarding wizard went for a different reason, which UAT surfaced by
accident: it couldn't be tested at all. The gate is "has a `profiles`
row," the only account that exists has one, so `0026`'s headline feature
was unreachable for the person who had to sign it off. An account with no
producer now says so plainly and stops, rather than offering a wizard
that creates the wrong shape of account -- because parcels are becoming
what Growdy sells, so a new account's first run is a purchase and a
GIS-drawn boundary, not a text box asking for a vineyard name.
`create_producer_and_profile` stays in the database as the way access is
granted by hand meanwhile. The plot status grid went too, on its own
evidence: it promised a plot's health at a glance and mostly rendered
grey, since status is only known for the few plantings carrying a dead
or removed date. A spatial view of a plot is a GIS job.

Parcel sharing went, and this is the awkward one to record honestly,
because it was built and merged the same night it was removed (#163,
above in this same section before this rewrite). That PR was good work
on its own terms -- it found a real bug, that `parcels`' own `select`
policy had never been updated to the `user_can_access_parcel` check
`plots`/`plot_rows`/`planting` already got, so a share recipient could
see a shared parcel's contents but never the parcel row they belong to,
and it verified the fix empirically with a scratch recipient and an
unrelated stranger. The consistency fix survives; the feature it was
built for does not. The reason is commercial and it postdates the
work by about an hour: parcels are the seat Growdy sells, so a producer
handing one to another producer is a hole in exactly the thing being
charged for. `0025`'s own Context had already seen the shape of this
("parcels and/or users may become billable later... a share must never
make a parcel count against more than one producer") and the cheapest
way to honour that constraint turns out to be not having shares. Zero
were ever created. Self-serve parcel creation, `0025`'s other half, went
with it for the mirror-image reason -- a producer minting unlimited
parcels for free is the same hole from the other direction -- so
`authenticated` now holds no `INSERT` grant on `parcels` at all. The
withdrawal runs as its own migration *after* the UI-support one rather
than replacing it, so the record shows a feature built and then
withdrawn instead of one that never existed.

One thing was added, in place of all that: a fenced ```log-observation```
block in a chat reply becomes a real "Log this observation" button on
that message. The conversation is where an observation actually gets
worked out -- a producer says what they saw, the chat establishes which
block and what date -- so the button belongs on that message rather than
behind a separate form. It's the third use of the pattern `0021` (`svg`)
and `0022` (`confirm-write`) established, reusing it deliberately rather
than adding a fourth mechanism, and both fence overrides now read one
shared set of tags, since a tag handled in `code()` but missed in
`pre()` is precisely what broke `ConfirmWriteCard`'s text wrapping the
first time. It writes straight to `observations` instead of going
through `propose_write_query`, which is only honest now that there's no
review step: a confirm/decline round trip to produce a row the producer
can delete in one tap was ceremony without a purpose.

Two things UAT surfaced are still open and worth naming rather than
leaving in a checklist. Memory recall cannot currently work: nothing
saved is searchable until the six-hourly embedding job runs, and that
job is being rejected with `429` by Voyage for want of a payment method,
which also leaves 29 of 43 conversations unembedded and the backlog
growing. And the reason so much of the pass came back blocked is that
there is nowhere safe to write -- the right isolation boundary is a
second *producer*, not a second parcel, since `conversations`,
`observations`, `producer_memory`, `pending_writes`, `artifacts` and
`audit_log` are all producer-scoped.

The other half of the batch points the opposite way from the removals:
growdy got that second front end, though nobody outside the repo can see
it. [`0029`](docs/decisions/0029-ios-shell-and-native-sign-in.md) wraps
the existing Vite build in a Capacitor shell rather than starting a
native rewrite -- one codebase, `0008`'s Vercel deploy untouched, and
`app/ios/` a real Xcode project checked in beside it. It deliberately
does not replace the home-screen install that shipped earlier in this
same batch; a manifest is still the right answer for anyone in a
browser, and stays the fallback for every producer who never installs
from a store. The shell is for what a manifest structurally cannot
reach: the App Store, push, camera, geolocation.

Sign-in had to change to survive the move, and the reason is invisible
until you try it. Capacitor serves the app from `capacitor://localhost`
and hands off-origin navigation to Safari, so `signInWithOAuth` opens
Google in a real browser -- no embedded-webview block, it genuinely
works -- and then drops the callback in Safari against the web Site URL,
where the session dies. The usual remedy is a custom URL scheme and a
deep link back; the native flow makes that repair unnecessary, since
`signInWithIdToken` takes a token straight from the OS account sheet and
there is no redirect to catch. Sign in with Apple is scoped and unbuilt:
App Store guideline 4.8 makes it mandatory wherever a social login sets
up the primary account, so a Google-only build is a rejection at
submission, not a gap to fill later. It waits on a paid Apple Developer
team -- which is now also required to build for the simulator at all,
since the Google SDK persists to the keychain and Xcode emits no
entitlement without one.

Four process changes ride along, each from a failure in this batch
rather than from speculation. `#165` replaced the ADR trigger: "took
real back-and-forth to settle" measured effort, which is just what
solving a problem looks like, and the iOS nonce chase proved it -- an
afternoon lost to a plugin silently returning a cached token and
discarding the nonce we passed, worth one code comment and no ADR. Then
`0028` and `0029` both landed as `0028`, each branch cut before the
other existed, and the stale one argued we had declined a PWA while the
PR it collided with was shipping one, so `#168` says to re-check the
decision against current `main`, not just the filename. `#169` narrowed
what a release note may contain -- what this release materially changed
about the app, nothing merged-but-unreachable, nothing about an outage
-- and wrote down that process decisions get committed rather than
agreed in conversation. `#170` then found why the base docs kept going
stale: the drift check lived only in the release checklist, so with
auto-merge on nothing prompted anyone while they still remembered what
changed. It moved to `CONTRIBUTING.md` Workflow step 4, with `AGENTS.md`
and a PR-template section as the mechanisms that make it hard to skip.

Two things UAT surfaced remain open and unfixed by this batch: memory
recall still cannot work while Voyage rejects the embedding job for want
of a payment method, and artifact share links built from
`window.location.origin` resolve to `capacitor://localhost` inside the
shell, which `0029` records rather than fixes.

## [0.12.0] - 2026-09-18

This batch finishes two things `0.10.0` already described as done and,
per a docs coherency pass that checked the whole release history
against what actually shipped, weren't: the chat's write tool had no
way to actually reach a producer, and the six-hourly scan for missed
observations had been silently failing on every single run since it
shipped, both errors invisible to the normal signals anyone would have
checked. Both are now genuinely fixed, corrections recorded directly on
`0.10.0`'s own entry rather than edited away. Alongside that, the chat
gained a real capability `0.10.0` never promised at all: a memory that
persists across conversations.

[`0022`](docs/decisions/0022-chat-writes-data-with-audit-and-rollback.md)'s
write tool is now actually reachable (#152): `propose_write_query`
joined `execute_readonly_query` as a real `chat` tool, and a fenced
`confirm-write` code block renders as an actual Confirm/Decline
card (`ConfirmWriteCard.tsx`), the same mechanism `0021` already taught
the frontend for a `svg` block. Two real bugs surfaced building it: a
`language-(\w+)` regex that didn't match a hyphen was silently
truncating `confirm-write` to `confirm`, and react-markdown wraps a
fenced block's rendered output in its own `<pre>` even after a custom
component replaces the contents -- invisible for `svg` (which ignores
`white-space`) but broke this card's text wrapping until both got a
matching `pre` override. `parcel_shares` got its own onboarding pass
through `0022`'s per-table checklist (#153) -- no `producer_id` column
of its own, so its audit trigger resolves the owner via a join to
`parcels` instead, which surfaced a real bug of its own: deleting a
parcel cascades to its shares, and by the time the trigger fires for
that cascade, the parent `parcels` row is already invisible to a plain
`select` -- fixed by skipping the audit insert rather than crashing the
delete. A later re-review of the same checklist, applied this time to
`pending_writes` itself rather than a producer-data table, found
`authenticated` held a broader `UPDATE` grant than the one real client
use (Decline) needed -- a raw update could have silently rewritten a
pending proposal's query after its summary was already shown, closed
by narrowing the grant to `status` alone (#158).

[`0023`](docs/decisions/0023-producer-memory-via-embeddings.md) is the
new capability: `search_memory`, a chat tool that embeds a question via
Voyage AI and runs a `pgvector` similarity search across two corpora --
a structured `producer_memory` table a producer can also write to
directly (through `0022`'s same confirm/decline path), and a
rebuildable `conversation_embeddings` index over past transcripts, kept
current by a new six-hourly scheduled job rather than embedded
synchronously on every turn (#150). Voyage/MongoDB's free-trial rate
limit (3 RPM/10K TPM) is real and already hit by that job -- harmless
today since unembedded rows just retry, but worth a payment method
before it matters for `search_memory`'s own live query embedding.

The scan-conversations fix (#149, #151) is named on `0.10.0`'s own
entry above rather than repeated here. Finding it, plus the still-open
embedding rate limit, came from actually building monitoring for this
project for the first time: `docs/monitoring.md` is now a real
inventory of every place that needs a human to look at it, and a
scheduled check plus a live dashboard ("Growdy Watch," hosted outside
this repo entirely -- see `docs/monitoring.md`'s own section 8) now
reads that inventory daily and pushes a notification when something
changes (#153-#157). A smaller fix rode along: the "what's new" popup
was showing every past release a producer had missed instead of just
the latest one (#147).

Last, the release process itself changed again, the same way it did in
`0.11.0`: a release now gets cut whenever a real feature ships, not
once a batch happens to feel big enough -- this exact batch, sitting
unreleased for a full day while real capabilities inside it went
unannounced, is why (#160). A full audit of every PR, release, and doc
against each other and against live production state also caught and
fixed a handful of doc-only drift: `0024`'s own title still claimed web
access was toggleable a day after it became always-on, and
`docs/data-model.md`'s diagram was missing `pending_writes` and
`audit_log` entirely despite three later updates to the same file
(#159).

## [0.11.0] - 2026-09-17

This batch closes the loop 0.10.0 opened. Chat could write, browse the
web, and mine old conversations for observations, but the account that
does all of that had no real beginning -- nothing had ever created a
producer for a brand-new sign-in, and a real one hit that gap directly.
The graphics chat can draw could only ever be seen inside chat itself,
with no way to hand one to someone who isn't a producer at all. Both
close here, along with a couple of small things that had been sitting
half-finished since the last release.

[`0026`](docs/decisions/0026-producer-onboarding.md) (#140) is the
onboarding gap closed: `create_producer_and_profile`, a `SECURITY
DEFINER` RPC (the same narrow-purpose shape `add_data_source` already
established), is now the only way a producer and profile get created
from the client -- `authenticated` has no `INSERT` grant on either
table, and none was added. A new `SessionRouter` decides onboarding vs.
the real app based on whether a profile exists yet; the wizard itself
asks for a vineyard name and, optionally, a first parcel. Building it
surfaced a second, unrelated gap: `0025`'s self-serve parcel creation
had a working `INSERT` policy but no form anywhere ever called it --
fixed alongside, with a standing "+ Add parcel" button, not just a
one-time wizard screen.

Two loose ends from 0.10.0's own bug-fix list got closed too (#139):
the chat's "thinking" indicator is now a four-frame pixel sprout
growing into bloom instead of a generic dot pulse, and `plot_rows`
picked up its third measurement (`end_post_count`) alongside a real
write path for all three -- `length_meters`/`spacing_meters` had
existed since early on with no way to ever set them, since
`authenticated` only ever held `SELECT`.

Real use also showed the opt-in gate on web search (`0024`) wasn't
earning its keep (#141): `web_search`/`web_fetch` cost is already
bounded tightly per turn, so requiring a producer to find and enable it
first was pure friction with no real decision behind it. It's always on
now, no toggle -- the same posture the read-only SQL tool and phenology
lookup already have.

The bigger new thread is [`0027`](docs/decisions/0027-public-artifact-links.md)
(#142, #143): a chat-drawn graphic can now be shared via an unguessable
link, no login needed to view it -- the first thing in this project a
signed-out visitor can ever reach. The real design question wasn't the
mechanism (Postgres already has cryptographically random `uuid`s), it
was avoiding turning that into an enumerable list -- solved with a
single narrow function, `get_public_artifact(id)`, not an RLS grant to
`anon`, since a table grant could be turned into `GET
/artifacts?select=*` and a function lookup by exact id can't. A new
panel lets a producer browse, copy the link to, and delete everything
they've shared, reusing the same modern visual language `ProducerDataView`
already established rather than the pixel-art chat chrome. Building the
public view also surfaced a real, previously-unnoticed bug in the
already-shipped full-screen chat graphic (`0021`): a model-written svg
with only a `viewBox` (no `width`/`height`) collapses to 0x0 inside a
flex-centered container when both CSS dimensions are `auto` -- fixed in
both places once found.

Last, the release process itself changed (#144, #145): the GitHub
Release body a producer actually sees in the app's "What's new" popup
had been the CHANGELOG's own internal prose, verbatim, every time --
ADR numbers and PR references meant for another engineer, not for
Virgil. Going forward the Release body is its own short bullet list,
this entry is the first to follow that split. Fixing this also surfaced
a real bug in the CI setup from earlier the same day: making `lint` a
required check on `main` meant any PR that didn't touch a migration
could never get that check to report at all, leaving it permanently
blocked rather than passing -- fixed by always running the workflow and
skipping its real work internally instead of gating the trigger itself.

## [0.10.0] - 2026-09-16

This is the batch where chat stopped being read-only. Growdy could
already answer questions about a producer's own data (`0016`); this
release lets it act on the world outside that data too -- writing
changes back with a real undo path, reaching the open web when the
vineyard's own tables don't have the answer, and mining a producer's
own past conversations for observations that were said out loud but
never logged. Alongside that, parcel access stopped being all-or-nothing
per account, and a real access-control gap that had been sitting in
production got caught and closed.

It starts with a small batch of chat fixes that had nothing to do with
any of that: errors now actually get logged instead of silently
swallowed, the feedback buttons work again, a long reply no longer
fights the user for scroll position, and the sprout icon's idle
animation stopped rotating the wrong way (#124).

The main new capability is
[`0022`](docs/decisions/0022-chat-writes-data-with-audit-and-rollback.md)
(#127, #130): the chat can now write to the database, not just query it.
It's deliberately the same shape `0016` already proved for reads -- one
general `execute_readonly_query`-style tool rather than a menu of
resolvers -- extended to two tools instead of one: `propose_write_query`
drafts arbitrary DML (never DDL -- `authenticated` owns no tables and
has no `CREATE`/`TRUNCATE` on `public` to begin with) and shows the
producer exactly what it's about to do, and `confirm_write` only runs
after a real click, never on the model's own judgment. Every write goes
through a generic audit trigger first, so `revert_audit_entry` can undo
one later -- field by field, and only where nobody else has touched that
specific field since, so reverting an old change can't silently clobber
a newer, unrelated edit to the same row. The design is honest about its
own limits in the ADR itself: it can't undo a real-world action a write
triggered, and it doesn't help with DDL at all -- rollback is a safety
net for mistakes in the data, not a general undo button.

**Correction added 2026-09-17, found during a docs coherency pass:** the
paragraph above describes `propose_write_query`/`confirm_write` as a
live capability, and at the database level it was -- but a producer
had no actual way to trigger it: neither tool was wired into `chat`'s
own tool loop, and no confirm/decline UI existed anywhere in the app.
PR #130's own title candidly called it a "lean version." The real,
producer-reachable write tool didn't ship until #152, 2026-09-17,
after `0.11.0` had already been tagged -- see
[0022](docs/decisions/0022-chat-writes-data-with-audit-and-rollback.md)'s
own status line. Left the paragraph above as written, same as every
other correction in this file, rather than editing history to read as
though it was accurate at the time.

Chat also picked up a second source of answers outside its own
database: [`0024`](docs/decisions/0024-web-access-as-a-provider.md)
(#129, #131) wires Anthropic's own hosted web search and web fetch in as
an opt-in Provider, sitting in the same Category -> Provider -> Source
taxonomy `0019` built for weather stations -- a producer sees and
enables "Anthropic Web Search" the same way they'd add a data source,
rather than it being an always-on tool with a cost nobody chose.

A real security gap got found and closed in two passes. The first
attempt (#132) revoked column-level `UPDATE` on `profiles.producer_id`
from `authenticated`, meant to stop a producer from re-pointing their
own membership at a different producer's account -- and looked correct
until direct privilege introspection showed it had done nothing: a
pre-existing table-level `GRANT UPDATE ON profiles TO authenticated`
from the very first migration already covered every column implicitly,
and a column-level `REVOKE` can't narrow a table-level grant that broad.
The real fix (#135) revokes the table-level grant entirely and re-grants
`UPDATE` on only the two columns a producer actually needs to change
(`full_name`, `last_seen_release`) -- verified this time with
`has_column_privilege` before shipping, not just reasoned about.

`last_seen_release` exists because of the release notes popup itself
(#133) -- the same screen rendering this text. The app now compares a
producer's own `last_seen_release` against GitHub's Releases API
directly (no duplicating release content into Postgres) and shows
what's new since their last visit, once, until they dismiss it.

Parcel access stopped being all specific to the owning producer:
[`0025`](docs/decisions/0025-parcel-sharing-and-self-serve-creation.md)
(#134) lets a parcel's owner share just that one parcel with another
producer as an Editor or Viewer, cascading down through its plots, rows,
and plantings via the same isolated access-check functions `0001`
already built for exactly this kind of extension, rather than reaching
for a full-account membership join table the actual need didn't call
for. Producers can also create their own new parcels now, self-serve,
instead of needing one seeded for them. The post-migration advisor pass
this project always runs caught three real findings across both this
migration and `0022`'s -- a function left executable by `PUBLIC` by
default, three unindexed foreign keys, and two permissive `SELECT`
policies that should've been one -- all fixed immediately (#136).

The last piece closes a gap chat's move away from direct submission
opened: a producer might mention something worth logging mid-conversation
without ever using the observation form. A scheduled job, reusing
`0020`'s same Vault-secret + `pg_cron` handshake, now reads conversations
every six hours, asks Claude whether each one actually describes a real
field observation, and -- only on a real match -- surfaces it as a
candidate the producer confirms or dismisses themselves (0025 follow-up,
#137). Nothing ever reaches `observations` without that click; this is a
recovery net for things already said, not a second submission path.

**Correction added 2026-09-18, found while cutting the next release:**
the paragraph above describes this scheduled scan as working, and it
was designed to -- but every single run of it, every six hours since
it shipped, failed on every single conversation with `permission
denied for table conversations`/`observation_candidates`, and both the
`pg_cron` job status and the Edge Function's own HTTP response looked
clean regardless, because `service_role` was never granted `select`
alongside its `update`/`insert` on those tables. Caught while writing
[`docs/monitoring.md`](docs/monitoring.md), fixed in
`20260917020100_scan_conversations_service_role_grants.sql` and,
completely, in `20260917030100_conversations_service_role_select_grant.sql`
(#149, #151) -- confirmed against a real run afterward:
`{"scanned":20,"candidatesCreated":1,"errors":[]}`. Left the paragraph
above as written, same as every other correction in this file.

## [0.9.0] - 2026-09-16

This milestone is the sprout menu (introduced in `0.8.0`) getting
refined through real, immediate use -- three quick interaction fixes
within a day of shipping, followed by the actual redesign of its second
feature that direct feedback asked for.

Trying the brand-new menu surfaced three issues at once: opening
sideways felt wrong for a trigger anchored to the header's left edge,
the hamburger kept showing its closed icon rotated next to its own
exploded layers once open, and the Knowledge Categories icon -- already
redesigned twice in `0.8.0` -- still wasn't reading clearly. All three
got fixed together (#118): the sprout menu now opens downward; the
hamburger's toggle shows a bun-slice in place of the burger once open,
doubling as the bar's own trailing bun instead of drawing it twice; and
the icon became a plain connected-nodes glyph, deliberately not an X or
checkmark shape, since those already mean negative/positive feedback
elsewhere in this icon set. Making the hamburger's own toggle swap its
icon on open surfaced a genuine bug, not just a style change: the same
click that opens the menu also removes the just-clicked SVG from the
DOM, so the existing click-outside-closes handler's
`contains(event.target)` check saw a now-detached node and read *every*
opening click as "outside," closing the menu on the same click that
opened it -- fixed with `event.composedPath()` instead, captured before
the swap happens, for both menus that share this handler shape.

A second real bug turned up within the hour, this time in the sprout
menu's new downward dropdown itself: it extends into the space
`.chat-messages` occupies, and both shared the same `z-index`, so
`.chat-messages` -- painted later in DOM order -- silently intercepted
every click on the dropdown's own buttons. They were visible and looked
correct; tapping them did nothing (#119). The fix reused the exact value
`.chat-input` already needed for the identical reason -- floating above
scrolled message content -- rather than inventing a new one.

With the menu itself solid, its second feature -- browsing the
producer's own data -- got the redesign direct feedback actually asked
for, replacing a level-by-level button drill-down real usage called
"clunky": a genuine collapsible tree (parcel -> plot -> row -> planting,
each node expanding in place instead of replacing the whole screen per
level, fetched and cached lazily), reaching one level deeper into a
planting's own observations from a shared detail panel without needing
a fifth tree level; and a separate, zoomable grid of colored status
dots, one per position, driven directly by `position_status`, for
reading a whole plot's health at a glance instead of row by row (#120).
This view deliberately breaks from the rest of the app's pixel-art
chrome for plain, dense, modern styling on purpose -- a real
data-browsing tool reads better dense than playful, the same call
`.chat-message-assistant` already made for a legible font over the
pixel one.

## [0.8.0] - 2026-09-15

This milestone draws a line this project hadn't needed before: what's
Growdy's own data, and what's the world outside it. Everything in this
batch either builds one side of that line or tests it against real use --
external data channels for weather, location, and phenology on one side;
a first non-chat surface for the producer's own parcels, rows, and
observations on the other; and, in between, the same discipline this
project always applies to a fixed menu of anything -- prove the pattern
once, then generalize it -- applied here to entire data sources instead
of query shapes or schema columns.

It starts smaller than that, though: a handful of mobile-web fixes that
had nothing to do with any of it -- the whole page no longer scrolls when
only the chat should, and the composer got slimmer (#86); `#root` now
sizes itself to the true visual viewport instead of the layout one, so an
iOS keyboard doesn't leave a dead gap at the bottom (#87); decorative
clouds now draw behind chat content instead of in front of it (#88); and
a stray drop shadow on the wordmark is gone (#89) -- the kind of rough
edges that don't block anything but do make an app feel unfinished every
time they're seen. Chat also stopped guessing at the schema from a bare
table list and started reading real column comments and foreign keys
directly (#90), a small change that mattered more once the schema was
about to grow.

The main arc starts from a question `docs/vision.md` had named but never
designed: real vineyard questions often need more than what's already
tracked, and Growdy had no way to bring outside data in at all.
[`0019`](docs/decisions/0019-external-data-channels.md) (#92) is that
design, deliberately built around one real first case -- Tempest weather
station telemetry -- rather than a general integration platform designed
ahead of any real source: a `Category -> Provider -> Source` taxonomy
where a category and provider are ours to add (real integration code
against a real API), and a source is the only thing a producer adds
themselves, against an existing provider, supplying only their own
credentials. `data_providers`, `data_sources`, and `weather_observations`
shipped as additive schema first (#93), followed by an `ingest-weather`
Edge Function that never touches `service_role` -- it authenticates as
the caller's own forwarded JWT, the same pattern `chat` already used, and
a producer's Tempest API key lives in Supabase Vault, reachable only
through two narrowly-scoped `SECURITY DEFINER` functions (#94), one of
which needed a real fix within a day of shipping: `CREATE FUNCTION`
grants `EXECUTE` to `PUBLIC` by default, and both had been missed (#95).
The chat learned to surface weather as real per-channel context (#96),
and a screen to add, toggle, sync, and remove a source shipped alongside
it (#97) -- at which point `0019` was marked accepted against what
actually shipped, including a full data-model diagram update (#98).

Real use immediately showed the trade-off `0019` had named out loud --
weather only refreshing while someone had the app open -- wasn't
acceptable, so [`0020`](docs/decisions/0020-scheduled-weather-sync.md)
brought back the `pg_cron` + `service_role` design `0019` had considered
and rejected first, now that there was a real reason to: one Edge
Function, `sync-scheduled-weather`, the only place in this project that
uses `service_role`, invoked hourly, authorized by a random secret minted
into Vault at migration time that no human ever sees or types (#100).
Standing that up for real surfaced exactly the kind of gaps a
never-actually-run scheduled job hides by design: real grant gaps and a
self-serve station-ID resolution flow so a producer never has to know
Tempest's internal device-ID concept (#101), a structural warning that
repeated itself thousands of times instead of being deduped (#102), a
stale-source backfill bug plus a cron timeout that was simply too short
(#103), and a non-numeric `observed_at` that aborted an entire chunk
instead of just the one bad reading (#104) -- each fixed as a bug in what
the ingestion code actually does, the same discipline `0.7.0` wrote into
`CONTRIBUTING.md` for the chat's own tools, now proven out on a scheduled
job instead of a model.

With one real provider proven end to end, the taxonomy itself needed to
be a real, navigable thing rather than a backend concept -- "Data
Channels" became "Knowledge Categories" (also fixing an invisible close
button, #105), the backfill floor changed from an arbitrary five years to
Tempest's own real 2019 launch date (#106), and the screen became a real
`Category -> Provider -> Source` drill-down instead of a flat add-source
form (#107). Then the taxonomy got tested against two sources that don't
look anything like Tempest: `location`, whose one provider is `Device` --
a producer's own browser geolocation, permission-based, no credential,
named `Device` specifically because a second, external-receiver provider
(`Trimble`) is expected later -- and `phenology`, whose provider is the
USA National Phenology Network, queried live per question against real
field-reported grapevine observations rather than a gridded model or a
synced table, with its full name used deliberately instead of the
acronym (#109, #112). Neither needed the credentialed add-source form at
all, which the UI hadn't accounted for -- a source with nothing to type
in got its own plain "Enable" flow instead of Tempest's Label/Station
ID/API key form asking for credentials that don't exist (#115).

The chat also picked up a real second output shape: a fenced `svg` code
block renders as an actual picture, sanitized before it ever reaches
`dangerouslySetInnerHTML` the same way any other untrusted content this
project surfaces would be (#110), which then needed a way to see one at
actual size instead of squeezed into a chat bubble -- tap to enlarge
full-screen, one sanitize call reused for both sizes (#114). The
Knowledge Categories menu icon went through two real rounds before it
read as a book rather than a window or a cabinet (#111, #113), and the
chat input's placeholder text finally just says "Ask a question" (#108).

The last new thread doesn't touch the chat at all: tapping the sprout
icon now opens a floating menu of features that live outside it
entirely, on purpose, starting with two. A structured observation-entry
form writes straight to `observations` using its existing columns as
real form widgets, still landing as `pending` for the same human-review
gate chat-submitted rows always went through; and a read-only browser
walks a producer's own parcel -> plot -> row -> planting structure,
scoped to currently-active plantings so a row's full replant history
doesn't clutter what's actually out there right now. Both are
deliberately kept off the Knowledge Categories screen: that taxonomy is
for external reference channels, while a producer's own core vineyard
data and their own field notes stay on this new, separate menu instead
(#116). Building the first of the two also surfaced a genuine browser
quirk worth naming: wrapping a multi-button custom control in a plain
`<label>` lets the browser's own label-click-forwarding fire a second,
synthetic click on whatever ends up first in the DOM after a re-render --
here, undoing a selection immediately after making it -- fixed by not
using `<label>` for anything more complex than one simple input.

Closing this batch out the same way `0.7.0` closed the last one: the
release checklist itself found two things nobody had noticed. `pg_net`,
enabled for the scheduled-sync work, had landed in the `public` schema
instead of `extensions` -- every other extension in this project already
followed that convention. It stays there for now, though: `pg_net` runs
its own background worker wired up at the Postgres server level, and
doesn't support `ALTER EXTENSION ... SET SCHEMA` at all -- CI's own
`db-lint` run caught that immediately. Actually relocating it means
dropping and recreating the extension, a real risk to the live hourly
sync this project depends on for something that's a namespace-hygiene
WARN, not an active exposure, so it's named here and left alone rather
than forced through. And `docs/architecture.md`, last updated when this
project had exactly one Edge Function and one external API, hadn't been
touched since -- it now reflects all four Edge Functions, three external
APIs, and the scheduled job that ties them together, with the version it
replaces kept in the file's own History section rather than only
reachable through `git log -p`.

## [0.7.0] - 2026-09-14

This milestone is the chat's second real redesign, and it starts from a
question about the project's own habits rather than a feature request: how
much of the growing pile of per-question resolvers and hand-written SQL
functions was genuine safety, versus one specific, avoidable design choice
made early on. A real question exposed the first crack -- asked how much
Gamay was planted, the chat confidently answered from data that was already
wrong before it ever saw it, because PostgREST's default cap silently
returns at most 1,000 rows from an unbounded `select()`, and 2,004 real
plantings actually matched. Moving the counting into SQL itself fixed that
one case (`0015`, #73), but it held for barely a day before the same
underlying shape -- a fixed menu of client-resolved query types -- hit a
ceiling no amount of patching a resolver could get past: a natural
follow-up question with no matching shape, a misspelling no prompt wording
could reliably normalize into a structured argument. Every version of the
chat since `0009` had insisted the model never see or write a real query;
relaxing that specifically for reads -- reads can't corrupt data, and RLS
still applies no matter what SQL runs -- let nearly the entire resolver
layer disappear at once, replaced by one tool, `execute_readonly_query`,
verified safe directly against production (a nested data-modifying CTE,
the one way past a naive text check, is still caught because the whole
request runs inside a genuine Postgres read-only transaction). Chat-based
observation *submission* was removed in the same change, though the
`observations` table itself wasn't -- its 211 rows turned out to be real
pre-chat field-note data, not review cruft, and stayed exactly as they
were (`0016`, #76, superseding `0015`'s mechanism along with `0009`,
`0010`, and `0012`).

Handing the model a real query to write meant the next few days of actual
use surfaced exactly the kind of gap a fixed menu had been hiding by
design, and each one got fixed as a bug in what the tool does rather than
a rule bolted onto the prompt: an agent that hit its iteration cap failed
with a bare 502 and nothing to tell that apart from a real crash, fixed
with per-call logging and a graceful fallback answer instead of a hard
stop (#77); a trailing semicolon the query wrapper couldn't parse, fixed
once in the function instead of asked around in every future prompt
(#78); and an iteration cap tuned for the old design, raised once
genuinely multi-step questions started asking for more room than six
calls allowed, alongside a visible "thinking" indicator so a longer answer
doesn't read as nothing happening (#82). That instinct -- fix the tool's
behavior, don't patch the prompt per failure -- is now written into
`CONTRIBUTING.md` directly, so it outlives any one bug (#78).

A much smaller, unrelated discovery turned into its own standing rule: the
architecture-diagram link inside a merged PR's own description had quietly
gone dead, because a relative or branch-relative link only ever resolves
during the PR's own review window -- the branch it points at gets deleted
on every squash merge here. Twenty-five historical PRs got their links
repaired against the one link shape that actually survives that (a
specific merge-commit SHA), and PR descriptions now reference files as
plain inline code instead of links at all, so the same rot can't recur
(#75). A separate, more pointed question -- whether CI had actually
finished before two recent PRs were merged -- turned up a real process
gap: both had been merged on a snapshot of check status taken before their
lint check had even started, not a final result. `CONTRIBUTING.md` now
says plainly that a status report has to reflect every check in a
finished state, and every PR since has been polled to an actual final
state before merging (#79).

Two real screenshots caught what a chat interface actually needs: raw
markdown syntax showing up verbatim in an assistant's reply because
nothing was rendering it, and a decorative pixel-art font that read a
table's "2,004" as "8,004" at a glance. Assistant messages now render as
real markdown, tables included, in a plain and legible font -- reserving
the pixel-art style for the chrome around the conversation rather than
the data inside it (#80).

The last thread wasn't about the chat's intelligence at all: an
already-open browser tab keeps running whatever it loaded indefinitely,
with no way to make it pick up a new deploy, and no way to signal "don't
use this right now" while something riskier than usual runs directly
against production. One polling check now covers both -- a build-time
version stamp compares itself against a fresh fetch on every open tab,
and a manually-toggleable maintenance flag hard-blocks the whole app, no
dismiss button, so a stale tab (or a second, unaware agent session) can't
act on assumptions that stopped being true (`0017`, #81).

Woven through all of it: this project keeps finding, at release time, that
its own higher-level docs describe an earlier version of itself than the
one actually live, and this batch closed that gap twice -- once at the
start, catching that `docs/architecture.md` still treated Vercel as an
open question rather than the app's real, finalized, auto-deploying host
(#72), and again at the very end, catching that the same diagram was
missing the app's new direct `app_status` poll (#84). The five ADRs this
batch touches (`0009`, `0010`, `0012`, `0014`, `0015`) are marked
superseded where their mechanism is actually gone, and left accepted
where the underlying schema fact still holds regardless (#83) -- the same
discipline applied to the diagrams, applied to the decision record.

## [0.6.0] - 2026-09-14

This milestone closes two gaps between what the chat could technically
do and what actually came up watching it get used for real, plus one gap
that isn't about the chat at all: how little stands between this project
and its own mistakes.

Every answer the chat gave used to come from a fixed client-side string
template -- the model only ever extracted *what* was being asked, never
saw the data behind it, so "how much Gamay do I have" and "where is my
Gamay" produced the exact same shape of reply regardless of which was
actually asked. A real question exposed this precisely: two thousand
real Gamay plantings, and the only answer on offer was a bare count. The
fix completes the tool-use round trip that had been half-built since
`0010` -- the client still resolves every question exactly the same safe
way it always did, but now sends that resolved data back to the model as
a proper `tool_result` and lets it compose the actual reply, so the
answer can finally reflect how the question was phrased (`0013`, #66).

Logging had the mirror-image problem: every observation required a
resolved plot, row, and position, matching everything the chat's
submission flow was originally built around -- a note about one specific
plant. Real use didn't stay that narrow. "I trimmed the weeds" and
"sprayed the whole vineyard" aren't about any single plant, and the chat
just kept asking for a position that was never going to exist.
`observations.planting_id` is now nullable, and the chat only asks for a
location when what's being described actually sounds like it's about one
plant (`0014`, #68).

The third thread isn't about the chat: this project runs on Supabase's
Free plan, which keeps zero backups of its own, and a lot of the routine
work here -- reconciling a migration, checking real row counts, tracing a
bug -- means running SQL directly against production, entirely outside
the review a migration gets. Rather than stand up a scheduled backup
pipeline sized for a project much bigger than this one, two lightweight
habits live in `CONTRIBUTING.md` instead: a migration that would destroy
real data renames first and drops later, once there's been time to
notice if something still needed it, and any direct write against
production gets a manual snapshot taken first (#69).

## [0.5.0] - 2026-09-13

This milestone is the arc from two separate chat screens to one real
conversation: producers could already log an observation through chat
(`0009`); this batch adds asking a question the same way, remembers
every session either kind of exchange happens in, and then, once both
had existed side by side long enough to feel like an artificial choice,
merges them into a single agent that figures out which one you mean.

Read-only Q&A (`docs/decisions/0010`, #45) started narrow on purpose --
a producer could ask what's at one specific plot/row/position, or which
positions in one row are open, and nothing broader, the same "prove the
pattern before generalizing it" discipline this project has followed
since its first migration. Real use outgrew that scope almost
immediately, in exactly the order it was likely to: a question about a
whole parcel came first (#53), then a question about a variety searched
across every parcel a producer has (#56), and finally -- caught only
because a real answer came back wrong -- a variety search that never
checked the free-text `nickname` field, missing over two thousand real
matches that lived there and nowhere else (#64). Each addition is one
new named query type and a client-side resolver, never a change to how
much the model itself is trusted to do -- exactly the shape `0010`
designed for.

Neither chat mode left anything behind for a producer to look back at,
so `conversations` (`docs/decisions/0011`, #55) gives every session --
asked or logged -- a row of its own, browsable from a slide-out history
drawer that widened and grew per-message thumbs up/down feedback once
it existed to look at (#57). That, in turn, exposed a real duplication:
a submitted observation's transcript was being stored twice, once on
its own row and once on its parent conversation. `observations` now
points at its `conversations` row instead of carrying a second copy
(#60) -- which, in turn, is why the security advisors got checked
after that migration but the performance ones didn't: the new foreign
key had no covering index until this release's own pre-tag advisor
check caught it.

With both modes proven out and a shared history behind them, choosing
"Ask a question" or "Log an observation" up front stopped being a real
decision a producer needed to make -- so `observation-chat` and
`data-qa` became one Edge Function and one prompt, deciding per turn
which tool applies (`docs/decisions/0012`, #62). The account menu lost
a button it no longer needed.

The rest of this batch closes the gap between "works" and "feels like a
real app to open": the sign-in screen and chat now respect an iPhone's
notch and home indicator properly (#46), the account menu became a
horizontal strip that slides out from the hamburger icon instead of a
plain dropdown, built from the same pixel-art burger geometry rather
than new shapes drawn to match its colors (#59, #63), and the "New
chat" icon went through several real rounds of iteration -- a pencil,
then a box with a plus, then a chat bubble -- settling on a plain
square with its corner broken by a plus badge once a diagonal pencil
turned out to blur into an unrecognizable blob at actual button size
(#47-#52). Thumbs up/down feedback got the same treatment once the
thumb glyphs themselves turned out not to read at 14px, replaced with a
solid check and X (#63).

## [0.4.0] - 2026-09-13

This milestone turns the app from functional into something people would
actually want to open: a real mobile chat layout, then a full visual
identity built around the same "gamified, satisfying to use" goal that
motivated the chat-based submission design in the first place -- the
better the experience, the better the data.

Getting there meant treating the signed-in view as a real chat app
instead of a form that happened to scroll: a conversation someone might
reopen needed a way to start over ("New chat"), account controls needed
to stop competing with the conversation for space (tucked behind a small
menu icon instead of always visible), and the composer needed to
actually stay put regardless of what a mobile browser's address bar or
on-screen keyboard was doing -- flexbox and `100dvh` alone don't reliably
reach the true edge of the screen once either of those kicks in, so the
composer is now genuinely fixed to the viewport instead (#37). The
sign-in screen needed the same rigor: centered content and Google's own
branded button instead of a generic one, since that's what a real
sign-in screen is expected to look like (#38).

On top of that, the whole visual identity got rebuilt around why this
app collects data at all: a field worker is more likely to actually log
an observation, and log it with enough detail to be useful, if the app
feels worth opening rather than a generic dark utility -- so it's now a
cozy farming-game aesthetic instead: warm wood and parchment, a
pixel-style font and icon set, and a chat screen split between open sky,
where the conversation happens, and soil, where an observation gets
"planted" (#39).

Building the theme also led to a real, if unrelated, finding:
`planting_readable` and `position_status` both defaulted to `SECURITY
DEFINER`, meaning they evaluated row-level security using the view
owner's privileges rather than the querying user's -- fixed by switching
both to `security_invoker` (#40). Since that fix only got caught because
someone happened to check Supabase's advisors, checking them is now an
explicit step after every migration and before every release, not
something left to chance (#41).

## [0.3.0] - 2026-09-13

This milestone is the app's real beginning: producers can now sign in
and describe field observations in their own words through an
AI-guided conversation, instead of filling out a form. That's a
deliberate choice, not just a UX preference -- real field language
surfaces gaps in the schema a form would hide, the same role the
original spreadsheet imports played back when this project started
(`plant_types.kind`, the dead/removed distinction). Chat just makes
that an ongoing source of evidence instead of a one-time event.
Building it immediately proved the point twice over: the very first
end-to-end test surfaced a permissions gap that had been sitting
invisible in the schema since day one.

The app (`app/`) exists now, and it's real, not a placeholder: an
authenticated client using Google Sign-In, restricted to explicit test
users while the underlying Google Cloud app stays in Testing status
(docs/decisions/0008, #23, #24, #25). A producer describes what they
saw -- "the plant near the busted trellis has fungus" -- and a
Supabase Edge Function holding the Claude API key gathers whatever's
missing through conversation and resolves it against
`planting_readable`, but nothing is inserted without a plain
confirmation first, and even then a submission can only ever land as
`pending`, enforced by the database itself rather than app convention.
The raw transcript is kept alongside the resolved fields for the same
reason the chat exists at all: reviewing it judges whether the AI
understood correctly, and, over time, tunes the schema against how
people actually describe what they see (docs/decisions/0009, #26,
#27, #29, #30).

The permissions gap that first test surfaced turned out to be bigger
than expected: every table in the schema, plus the two derived views,
had row-level security policies that were entirely correct but never
actually reachable by a real signed-in user. A base `grant` Postgres
checks before row-level security is even evaluated had been missing
since day one, invisible because every prior check in this project ran
through an elevated connection that bypasses it (#32, #33). Fixed now
-- exactly the kind of gap the app exists to surface.

## [0.2.0] - 2026-09-13

This milestone exists because of a test import -- running real vineyard
data through the schema surfaced exactly what it was still missing, and
this batch of changes is a direct response to that.

Grafted plants needed two separate identities, not one free-text
`species` field, so `plant_types` (#9, #11, #12; supersedes
`docs/decisions/0003`, see `0004`) became a shared vocabulary of
varieties, scions, and rootstocks that `planting` now references
directly. Field notes needed a home, so `observations` (#13; `0005`)
gives every planting an append-only, dated note. A plant dying and a
plant being physically removed turned out to be two different moments,
not one, so `planting` gained `dead_date` and `removed_reason` (#14;
`0006`), and a `position_status` view derives planted/blocked/open per
position from that instead of storing it redundantly (#16). `plot_rows`
picked up `length_meters` and `spacing_meters` for real row geometry
(#15), and `planting_readable` (#18) resolves every foreign key to its
name for browsing without manual joins -- the full shape of it all is now
diagrammed in `docs/data-model.md` (#17).

The import also forced a hard rule: an uncertain identity -- an
unconfirmed scion, a hedged rootstock -- stays null rather than becoming
a stored guess (#19; `0007`). A routine performance pass separately fixed
an `auth_rls_initplan` warning on the `profiles` RLS policies (#20).

## [0.1.0] - 2026-09-12

The full tenancy + land hierarchy: `producer` -> `parcel` -> `plot` ->
`plot_row` -> `planting`. See `docs/decisions/0001` and `docs/decisions/0002`
for the reasoning behind the tenancy model and the organized/unplotted
planting design.

### Added

- Tenancy foundation: `producers` (permission boundary) and `profiles`,
  with every RLS policy scoped through a single reusable helper function,
  `private.user_can_access_producer()` (#1)
- `parcels` -- the top-level land unit a producer owns/leases (#3)
- `plots` -- named subdivisions within a parcel, organizing plantings into
  rows (#4)
- `plot_rows` -- numbered rows within a plot (#6)
- `planting` -- one plant's occupancy of a place: organized
  (plot/row/position) or unplotted (a PostGIS location, for weeds,
  invasives, and wild finds), never edited in place (#7)
- PostGIS, enabled once an actual need existed rather than speculatively
  ahead of one
- CI: a `db-lint` GitHub Action validating every migration against a fresh
  local Supabase stack on every pull request
- Repository process: branch protection requiring PRs on `main`,
  squash-only merges, `CONTRIBUTING.md`, and an ADR practice
  (`docs/decisions/`) for decisions worth preserving the reasoning behind
  (#2, #5)

### Fixed

- `db-lint` scoped to this project's own schemas (`public`, `private`),
  excluding PostGIS's bundled legacy functions from lint checks (#7)
