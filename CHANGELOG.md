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

## [0.16.0] - 2026-09-21

The half that survives a rewrite.

[`0038`](docs/decisions/0038-the-phone-gets-its-own-client.md) decided
that the phone gets a native SwiftUI client and the React app is frozen
as a desktop surface, and it decided it on measurement rather than
preference: 436 lines of client code exist for no reason except that a
`WKWebView` will not do what a phone does, six of `0.15.0`'s forty-two
commits were keyboard, gesture or touch fixes, and a probe on the device
proved `backdrop-filter` silently ignores an SVG filter -- so the edge
refraction a producer asked for is unreachable in CSS rather than merely
difficult. The alternatives are recorded there with their real arguments,
including the scoped native compose bar that was recommended first and
withdrawn the same evening, because a map is coming and that option
leaves a React chat wedged between two native surfaces.

What that decision does to this release is decide what matters. The
schema, the Edge Functions and the auth model are the half that does not
get rewritten --- roughly two thirds of the system by the only measure
that counts --- and they are about to be the only thing two clients
share. So this batch is almost entirely them, and the work is less
"build" than "find out what nothing was checking."

The answer turned out to be: quite a lot, and the same thing five times.
A migration that says `create or replace function` and changes the
argument list does not replace a function; Postgres creates a second one,
and a new function inherits no ACL, so it gets the default, which is
`EXECUTE` to `PUBLIC`. That had happened to the Vault helpers
(`20260915040133`), to the parcel share audit trigger (`20260917164242`),
to `create_observation_candidate` (`#236`), and then to seven functions
at once (`#243`) --- including `execute_readonly_query`, the chat's read
tool, which takes a SQL string. Verified rather than inferred: `set local
role anon` and a call enumerated twenty-one tables out of
`information_schema`. RLS is why that was a disclosure and not a breach;
no producer row came back, because every policy compares against a
`current_producer_id()` that is null for `anon`. What did come back was
`pg_catalog` --- every table and column, every function body, every policy
expression --- which is a map of the database and of the defences on it.

Five times, and five times it was a person noticing, which is the part
worth fixing. The Supabase advisor structurally cannot see this class:
its anon-callable lint fires on `SECURITY DEFINER` and all seven of those
functions were `SECURITY INVOKER`, so "check the advisors" at release time
would not have surfaced any of it, in any release, past or future.
`scripts/check-anon-reach.mjs` (`#249`) closes it by reading the resulting
ACL out of the database rather than the migration text --- because the
gap between what a migration says and what Postgres does is precisely
where this lives. It found one thing within minutes of merging: the
GraphQL entrypoint, in no migration in this repo because it is Supabase's,
which no amount of reading `supabase/migrations/` would ever have
mentioned (`#250`).

Three other doors closed with it. The three browser-facing Edge Functions
were reaching Anthropic and Tempest for callers carrying no credentials at
all (`#238`/`#239`, merged during `0.15.0` and deployed here), which
matters because `verify_jwt` is deliberately false on all six so each can
answer its own CORS preflight --- the gateway checks nothing, and those
few lines are the whole of the access control. The `pg_cron` trigger
secrets were travelling in a `pg_net` header that every signed-in user can
read for about a second, three times a day, which made `0020`'s "never
seen by a human" true of the Vault row and false of the header; `pg_net`'s
queue is owned by `supabase_admin` and refused a revoke, so the fix was to
make the captured value expire --- an HMAC over a five-minute bucket, so a
token lifted out of the queue is worth minutes instead of forever
(`#246`). And `anon` and `authenticated` both held `TRUNCATE` on every
table from Supabase's platform default, which RLS does not apply to and
which `audit_row_change`, being a row-level trigger, would not have
recorded (`#247`, `#252`).

The checks went in alongside, because a finding that only a person can
catch is a finding that comes back. `supabase/functions/` --- 2,248 lines,
and now the only access control there is --- had no typecheck, no lint and
no tests at all; it has all three plus a structural check that reads the
one thing a test cannot, which is whether each handler still resolves its
caller *before* it does anything that costs money (`#251`). That ordering
is what `#238` actually was: the guard was not missing, it was late.
`check-rls-shape.mjs`, written in `0036` to stop a per-row tenancy check
coming back, had been reading `nspname = 'public'` only --- so the last
three instances of the shape it exists to prevent, all in `storage`, were
invisible to it (`#253`).

The one producer-visible change is a removal. The artifacts feature ---
the model drawing an SVG inline in a reply, the producer saving it, and
the `/a/<id>` page a signed-out browser could open --- is gone entirely,
and `0027` is withdrawn (`#241`). The share link decided it: it is a web
page reached from a browser, and the client a producer actually opens will
soon have no way to carry it. The drawings could have stayed, and did not,
because the verdict on the two saved ones was that they were not good and
a capability nobody has reached for in two weeks is not one to carry into
a rewrite. `public.artifacts` is renamed rather than dropped, because
`CONTRIBUTING` requires that of a drop that would destroy real data, and
the drop waits for the window that rule exists to provide.

And the documentation stopped describing a project that no longer exists.
`AGENTS.md` --- the file a new agent reads first --- never mentioned that
growdy has a client, let alone two, and its rule that claims get checked
against `app/src/` had quietly become an instruction to verify native
behaviour by reading React (`#244`). Sixteen drift items went with it,
the worst being `architecture.md` still describing "the sprout menu's two
features" for a menu deleted in `#224`, and a diagram still showing one
composed reply for a chat that has streamed since `#200`.

## [0.15.0] - 2026-09-21

Every complaint in this batch is the same one in a different register:
something in the app knew what was happening and did not say. The chat
went quiet for twenty seconds and then produced a paragraph, with
nothing in between to tell a slow answer from a stuck one. The database
handed the model a list of table names and let it infer the rest from
the names alone. A finger landed on something that plainly looked like
the chat box and nothing happened, which does not read as a miss, it
reads as the app ignoring you. None was a feature request, and each
ends the same way: a confidently wrong answer at one end and a patient,
confused producer at the other.

The app got one face first: three typefaces where one was needed, icons
that went soft at phone size, and a menu of unlabelled circles you
simply had to learn
([#198](https://github.com/sethschrage/growdy/pull/198)). It is one
typeface now, icons on a 24px grid, and a burger that comes apart
downward into labelled ovals
([#199](https://github.com/sethschrage/growdy/pull/199)). The point is
not the animation: a control which cannot say what it does has to be
memorised, and a tool you have to memorise is a tool you use less.

Then the wait became legible. Replies arrive as they are written, and
above them a line says what the chat is actually doing in the
producer's own terms -- "Reading your vineyard data", and what it
searched for -- rather than the tool's name, with elapsed seconds and
tokens beside it, both measured
([#200](https://github.com/sethschrage/growdy/pull/200)). The first
version broke in a way only production could show: reassembled thinking
blocks went back to the API without their signatures and every
multi-turn answer failed -- rebuilding the content array means knowing
about every delta type, not only the two that carry something a
producer sees ([#201](https://github.com/sethschrage/growdy/pull/201)).
That fix went out before its PR, so the rule that deploys wait for a
merge grew the exception it was missing: functions only, since one can
be undone by redeploying the previous version and a schema change
cannot ([#203](https://github.com/sethschrage/growdy/pull/203)).

Streaming made the cost visible, and the cost turned out to be a
sentence repeated. Every pass of the tool loop re-sends the whole
prompt -- instructions, seven tool definitions, the schema description:
15,240 tokens, measured on the live function, identical from one turn
to the next. Those are two cached blocks now, split by how fast each
half changes, so a five-tool answer reads the expensive half back at a
tenth of the input rate instead of paying for it six times
([`0033`](docs/decisions/0033-what-goes-in-the-cached-prompt.md),
[#202](https://github.com/sethschrage/growdy/pull/202)). The
interesting part is not the saving but what caching forbids: the cache
matches an exact prefix, byte for byte, so one volatile token --
today's date, a row count -- turns every request into a miss *and*
charges the write premium. Prompt assembly stopped being a matter of
tidiness and became load-bearing.

The second silence was older and worse. An audit found the
catalog-generated description of the database -- chosen in
[`0016`](docs/decisions/0016-chat-queries-directly.md) so it could not
drift -- nearly empty of meaning: **zero of the fourteen foreign keys**
reached it, so `plots.parcel_id` was a name the model inferred a join
from. The relation list is inverted now: every public relation is
described by default, the eight left out each carrying a written
reason, so a new table reaches the model when its migration applies,
not when somebody remembers
([`0034`](docs/decisions/0034-a-schema-change-has-to-explain-itself.md),
[#204](https://github.com/sethschrage/growdy/pull/204)). Underneath
that was one cause: nothing ever required a schema change to explain
itself. A migration now answers six questions in its header, answers
that exist only in the head of whoever asked for the change -- which is
why they belong before it, not after. CI fails a missing answer but is
satisfied by an invented one, ten minutes late and one context from the
person who knows, so a `PreToolUse` hook refuses the write itself
([#206](https://github.com/sethschrage/growdy/pull/206)). It cannot
make anyone ask -- a rule on files can only see files -- but the
refusal now happens in front of the person who can answer.

The same argument ran one level up: updating the base docs inside the
PR is a habit executed at the end of one, with auto-merge on and no
reviewer, and a stale line renders exactly like a fresh one. A survey
of the base documents and the 34 ADRs produced 44 candidate checks, of
which ten survived a pass that tried to break each against this repo's
history: a claim is checkable only when something else in the repo can
contradict it without anyone exercising judgement
([`0035`](docs/decisions/0035-what-the-docs-are-checked-against.md),
[#205](https://github.com/sethschrage/growdy/pull/205)). The
thirty-four rejections are recorded too: "require a doc to change when
code changes" is the obvious idea, and it is a gate rather than a
check, satisfied by touching the file. The release pass then found
sixteen more stale claims and widened step 1's own list, which had
named fewer documents than the per-PR check it backs up
([#237](https://github.com/sethschrage/growdy/pull/237)); the scratch
harnesses behind much of the measurement below are now refused by
`.gitignore` rather than by convention
([#235](https://github.com/sethschrage/growdy/pull/235)).

A silence pointed at the model rather than the producer cost
thirty-five seconds and eight turns: a weather query died on
`execute_readonly_query`'s five-second timeout, and the model spent
seven further turns working around a failure it could not see. The
query itself runs in 77ms; what timed out was the tenancy check, which
takes the row's own column as its argument, so it runs once per row,
and being `SECURITY DEFINER` cannot be inlined. Over
`weather_observations`' 143,588 rows the predicate alone measured
1,500ms against 15ms for the same test written to resolve the caller
once, and thirty policies were rewritten, provably to the same test
([`0036`](docs/decisions/0036-rls-predicates-are-evaluated-once.md),
[#211](https://github.com/sethschrage/growdy/pull/211)).
`scripts/check-rls-shape.mjs` now fails CI on the shape, since nothing
else could catch it: Supabase's initplan advisor never fired, the
per-row work hiding behind a helper.

Then the silence the app exists for. A producer asked what happens in
front of a vine with no connection; checked rather than assumed, the
answer was nothing deliberate
([`0037`](docs/decisions/0037-what-happens-with-no-signal.md)). A
question asked in a block with no bars failed twice and surfaced as
`Load failed` -- WebKit's words for a dead socket -- with no way to
send it again except retyping it. The app names the situation rather
than the mechanism now, and keeps the attempt whole -- transcript and
photo -- so the retry is the same request, not a reconstruction
([#214](https://github.com/sethschrage/growdy/pull/214)). A capture
made there failed outright: what somebody walked out to record was
lost. Every capture is written to a local queue first and flushed
immediately -- one path, not "send, and queue if that fails", because a
fallback exercised only in a field is one nobody finds broken until
they are standing in one
([#216](https://github.com/sethschrage/growdy/pull/216),
[#215](https://github.com/sethschrage/growdy/pull/215)).

An answer then learned to account for itself: a line under it says what
it looked at and what it cost -- "looked at" rather than "sources" on
purpose, because the stream can prove a query ran, not that the answer
rests on what came back
([#212](https://github.com/sethschrage/growdy/pull/212)). The cost was
wrong in the direction that flatters -- cache reads at full weight,
cache writes ignored though they bill at 1.25x -- and money sits beside
the tokens now, cached and fresh differing tenfold in price
([#217](https://github.com/sethschrage/growdy/pull/217)). The question
after "is it stuck" is what has it done, so `done` became `steps`, each
naming what it touched
([#228](https://github.com/sethschrage/growdy/pull/228)). The other
half of a step is what the model was thinking, and forwarding it would
have changed nothing on its own: reasoning runs by default on this
model, but `thinking.display` defaults to omitted, so the blocks were
arriving with an empty thinking field, and the fix is in the request
before it is in the wire
([#229](https://github.com/sethschrage/growdy/pull/229)). Summarised
rather than the full trace, which is priced as output tokens, and set
once for both request paths, so a buffered retry answers under the same
configuration.

And then a third silence turned up where none of the above was
watching. A message sent from the iPhone came back as `Load failed`
while server-side it was healthy in every way this project measures:
`POST | 200`, the model ran, `chat usage: in=79 out=182 cacheRead=0
cacheWrite=16938` logged like any other turn. Reproduced with `curl` it
streamed perfectly, twice more twenty minutes later: intermittent
transport, not a client that cannot stream, which is the case worth a
fallback. A stream that fails with nothing yet received asks again
buffered, while a part-delivered answer reports its failure rather than
replacing it ([#207](https://github.com/sethschrage/growdy/pull/207)).
The process half is the hinge. `0.15.0` was a day from being tagged
with "replies now arrive as they're written", on the client where they
had not arrived at all, and the checklist never once said to use the
app. It does now: every bullet a Release carries is exercised on the
client a producer uses, from a build of the commit being tagged, and
recorded in the release PR as what was observed rather than as
"tested". A complete `chat usage` line means the model answered, not
that anybody received it -- the failure mode `docs/monitoring.md` now
carries. `CONTRIBUTING.md` had also said a PR merges itself once CI
passes, while three sat green and open that evening -- a claim about
GitHub's behaviour, which no check here could catch
([#208](https://github.com/sethschrage/growdy/pull/208)).

The other half of that checklist paid for itself on the morning of the
tag. The Supabase advisor pass step 1 requires flagged
`create_observation_candidate` as callable by `anon`. The migration
that added `p_client_id` for the offline queue used `create or replace
function` with a changed argument list, which replaces nothing:
Postgres overloads on the signature, so the statement created a
*second* function, and a new function does not inherit the ACL of the
one it appears to replace -- it gets the default, EXECUTE to PUBLIC.
PUBLIC includes `anon`, and PostgREST exposes every public function at
`/rest/v1/rpc/<name>`, so the eleven-argument overload had been
callable by anyone holding the publishable key since it shipped.
Nothing could be inserted through it -- the body raises `No producer
for this user` when `auth.uid()` resolves to no profile -- but the
grant is the control, not the function declining to be useful, and it
is the third time this repo has undone that shape, after the vault
helpers and the parcel share audit. The grant is `authenticated` only
now, the ten-argument overload is dropped, and the migration has been
applied to the live project
([#236](https://github.com/sethschrage/growdy/pull/236)).

So the tag waited, and that is where the rest of this release came
from: twenty-seven of the thirty-nine pull requests here merged after
the entry above was drafted. The subject changes to how the app behaves
under a finger; the argument does not, because a control answers by
moving. The emblem of the batch is the steps disclosure from #228,
rendered under the status line, itself the last thing in a conversation
the compose bar floats over -- so it sat under the bar, every time, for
the whole life of a feature that exists only while an answer runs
([#230](https://github.com/sethschrage/growdy/pull/230)). It shipped
the previous day and was never once reachable. The instruments needed
watching as closely: the burger's geometry was measured three times
before it was measured correctly, the harness reporting the open bun
landing 0px from the closed crown while the producer kept watching it
move -- both true, because the numbers were read while the animation
still ran, describing a transient frame rather than the resting state
anybody sees ([#217](https://github.com/sethschrage/growdy/pull/217),
[#210](https://github.com/sethschrage/growdy/pull/210),
[#213](https://github.com/sethschrage/growdy/pull/213),
[#218](https://github.com/sethschrage/growdy/pull/218),
[#219](https://github.com/sethschrage/growdy/pull/219)).

The menu stopped being something you trigger and became something you
operate -- the same point made with a hand instead of a label. Open and
shut was a boolean with a 340ms animation attached, so the menu moved
at the app's speed whatever the hand on it was doing
([#220](https://github.com/sethschrage/growdy/pull/220)); it is a
number the gesture writes and the stylesheet reads now, with the
stagger a calc on that number rather than an `animation-delay`, which
exists only while an animation runs
([#221](https://github.com/sethschrage/growdy/pull/221)). That also
closed the worst hazard in the arc: `opacity: 0` does not stop hit
testing, so for 340ms after shutting the menu a tap on the burger was a
tap on "New chat", which throws away the conversation on screen.
History became a screen like the others, a 420px drawer being 90vw on a
phone ([#222](https://github.com/sethschrage/growdy/pull/222)); a new
chat left the menu for a permanent header button, the thing a producer
does most often not being a menu item, and the knowledge screen's
headings stopped rendering as raw database values
([#224](https://github.com/sethschrage/growdy/pull/224),
[#225](https://github.com/sethschrage/growdy/pull/225)).

The keyboard is the phone's, and until this batch the app had nothing
to say to it: no input set `inputMode`, `autoCapitalize` or
`autoCorrect`, so every field got the same QWERTY with autocorrect on
([#227](https://github.com/sethschrage/growdy/pull/227),
[#226](https://github.com/sethschrage/growdy/pull/226)). One was
actively destructive: iOS capitalises the first character of a text
field and autocorrects it, and a weather provider's API key is
case-sensitive, so the app was corrupting a value the producer cannot
read back through the dots, surfacing later as a source that will not
connect. The keyboard's arrival was the ugliest thing in the app:
`resize: 'native'` resized the web view with a bare `setFrame`, 0.45s
after the keyboard starts rising and 0.01s after it starts falling, so
the layout teleported out of phase in both directions, and on the way
down WebKit had ten milliseconds to repaint a full-screen gradient and
filled it with white instead
([#231](https://github.com/sethschrage/growdy/pull/231)). Nothing is
resized now; the bar rides up on a transform. And the gesture that
dismisses it worked here and failed on the phone: iOS stops delivering
`touchmove` once the native scroller takes a drag, which synthetic
touches never provoke
([#232](https://github.com/sethschrage/growdy/pull/232)).

Which left the bar, the one surface a producer touches on every
question, with several millimetres of what plainly looks like the chat
box doing nothing when tapped -- "the tap zone seems small and
unresponsive". It takes a tap anywhere in the pill via `pointerdown`
rather than `click` now, and became a capsule in glass
([#223](https://github.com/sethschrage/growdy/pull/223)). The
material's first pass followed Apple's references literally, and those
are of a dark app: darkening growdy's near-white sky gives a uniform
grey with nothing for the eye to read as glass
([#233](https://github.com/sethschrage/growdy/pull/233),
[#234](https://github.com/sethschrage/growdy/pull/234)). Its rim is
chromatic aberration tied to the press rather than the hue wheel tried
first, which read as "too much rainbow, too much lsd" -- colour while
nothing happened. The press answers the same way: growdy's buttons sank
when pushed, the web's convention and the opposite of a glass control,
which iOS grows under the thumb and lifts again when a finger that slid
off returns -- that last part is what makes it an object rather than a
state. `:active` cannot do it -- WebKit takes it away when the finger
leaves -- so the state is ours in `lib/press.ts`.

Not in this release, deliberately: the iOS app is still not on the App
Store; everything above reaches producers on the web. A system that
says what it is doing -- to the producer waiting on it, to the model
reading its schema, and to whoever reads it next -- is one you can
catch being wrong; a system that goes quiet is one you find out about
later. The same is true of the instruments: a green check, a clean log,
and a harness reporting 0px are claims like any other, and the only
evidence that the app answered is that somebody was holding it when it
did.

## [0.14.0] - 2026-09-19

The app learned to look at a photograph, and the record grew exactly one
door into it. Those two are the same batch on purpose: a photo analysed
by a model is the most confident-sounding and least verifiable thing
this project has ever produced, and it arrived in the same week as a
decision about what gets to become permanent.

Photographing an observation is the first thing the iOS shell made
worth building, and it works in the browser too. A producer attaches a
photo in chat -- camera or library -- and the chat looks at it with
their own vineyard in view: their plantings, their weather, what it
remembers of earlier conversations
([`0030`](docs/decisions/0030-every-observation-through-one-queue.md),
[#176](https://github.com/sethschrage/growdy/pull/176)). That context is
what makes the reading useful and also what makes it dangerous. A
generic captioner says "a grapevine leaf"; this one says which block,
which variety, and what it saw last week -- and if it is wrong, the
wrong answer is the one that sounds informed. It can open a photo again
later by its storage path, so "look at that one from Tuesday" is a real
request rather than a description of a description.

Which is why the review queue came back the day after `0.13.0` removed
one. [`0028`](docs/decisions/0028-what-uat-removed.md) had just deleted
the gate on `observations`, correctly: it had no gatekeeper, no `UPDATE`
grant, and every row in production had been approved by its own
backfill. `0030` does not re-add that column. It makes
`observation_candidates` -- a queue that has existed since `0.11.0`,
with a real screen a producer can reach -- the only way in, and then
closes every other door: `authenticated` holds no `INSERT` grant on
`observations` at all any more, and the one remaining writer is
`confirm_observation_candidate()`, which runs after someone has looked
at the row ([#183](https://github.com/sethschrage/growdy/pull/183)). The
queue widened to carry a whole observation rather than a one-line
summary, and gained a `source` column, because which path proposed a row
is what decides how much scrutiny it deserves. Confirming is one
transaction now, not two client statements with nothing holding them
together -- the old arrangement could leave an observation whose
candidate still read `pending`, and confirming again produced a
duplicate.

The honest part of that decision is in the ADR: the drift argument is
strong for anything a model wrote and weak for a note a producer typed
themselves, since they are the ground truth for their own vineyard.
Their own notes go through the queue anyway, because a deliberate pass
over what enters the permanent record was wanted for every source. That
is a preference, recorded as one, rather than a safety claim that only
fits half the cases.

A photo carries more than pixels, and this batch kept the rest of it.
The capture date is read out of the EXIF before the downscale destroys
it, so an observation is dated the morning it was seen rather than the
evening it was uploaded, and the full-resolution original is saved back
to the producer's own photo library -- the phone stays the archive and
this app only keeps a working copy
([#184](https://github.com/sethschrage/growdy/pull/184)). Location is
recorded twice, deliberately: where the camera was, and what the photo
is about ([#185](https://github.com/sethschrage/growdy/pull/185)). Most
photos never get a planting attached -- weed pressure across a block,
standing water, something odd at the fence line -- and for those the
point is the only spatial fact that will ever exist. The device position
is read at send rather than at capture, and the compose bar says so,
because that is what makes it worth walking to the vine before sending
([#187](https://github.com/sethschrage/growdy/pull/187)).

Everything above ran on a phone for the first time, which is where the
rest of the batch came from. The compose bar reserved a hardcoded height
that was twelve pixels short before a photo strip existed and badly
wrong after
([#179](https://github.com/sethschrage/growdy/pull/179),
[#180](https://github.com/sethschrage/growdy/pull/180)); the header
stopped a conversation from scrolling up under the Dynamic Island
([#181](https://github.com/sethschrage/growdy/pull/181)); iOS zoomed
into every form field under 16px and stranded the overlay it zoomed
([#175](https://github.com/sethschrage/growdy/pull/175)). The scroll
needed four attempts, and the last one is the interesting one: the
first three were reasoned from the layout and two of them were wrong,
so the fourth was measured instead. `scrollIntoView` aligns to the
scrollport and ignores the container's own padding, so "show the start
of the answer" was putting the first 64px of every long reply behind the
floating header -- a number read off the page, not inferred from it. A
short conversation had no scroll range at all, so a drag did nothing and
read as frozen. And the auto-scroll knew where the view was but not
whether a thumb was on it, which on iOS means a programmatic smooth
scroll finishing over the top of someone's finger
([#189](https://github.com/sethschrage/growdy/pull/189)).

Then the floor. This project reached `0.13.0` in seven days with no
tests and no CI touching the client at all -- `db-lint` ran on every PR
and read the schema, so a PR changing only `app/` was auto-merged,
unreviewed, on the strength of a check that had not looked at it. The
cost was visible in one place: four goes at the same scroll bug. `0.14.0`
adds Vitest, a CI job that typechecks, lints and tests every pull
request, and rules about what gets tested that are written as
obligations on specific kinds of code rather than as a coverage number
([`0031`](docs/decisions/0031-what-this-project-tests.md),
[#190](https://github.com/sethschrage/growdy/pull/190)). There are 114
tests now, and each was checked against a deliberately broken
implementation rather than assumed to be load-bearing.

The client was also reshaped for the map that comes next
([`0032`](docs/decisions/0032-client-organised-by-feature.md)): thirty
flat files became feature folders over a shared data layer
([#191](https://github.com/sethschrage/growdy/pull/191),
[#192](https://github.com/sethschrage/growdy/pull/192)), and one
2,258-line stylesheet became thirteen files along the seams it already
had ([#193](https://github.com/sethschrage/growdy/pull/193) -- the built
CSS is byte-identical, which is the only way to claim a move changed
nothing). The data layer is typed against the real schema rather than
against hand-written row types that agreed with it only as long as
someone remembered. The producer lookup, which decides tenancy for every
insert this client makes, existed in eight copies with two different
opinions about what a missing profile meant. It exists once now.

The floor paid for itself inside a day, which is the part worth
recording. Photos had never carried their location -- not once, in any
photo this app has taken. The reader looked for a flat `GPSLatitude`;
iOS nests it, because `@capacitor/camera` assigns the CoreGraphics GPS
dictionary wholesale, so the lookup silently found nothing and every
upload arrived with a date and no position
([#195](https://github.com/sethschrage/growdy/pull/195)). Nothing ever
complained, because a photo without GPS is completely ordinary -- which
is exactly why a bug that manufactures one is invisible. It was found by
going to verify a backlog item rather than by anything failing. Two
other things surfaced the same way: every link shared from inside the
iOS shell pointed at `capacitor://localhost` and was dead on arrival,
which `0029` had recorded and deferred
([#194](https://github.com/sethschrage/growdy/pull/194)), and the
release audit found `docs/architecture.md` still stating that no storage
bucket existed and nothing used it, three days after photos started
landing in one.

Supabase's security advisor, checked as part of cutting this release,
flagged the storage tenancy helper -- the function the `storage.objects`
policies call to decide which producer owns a photo -- as running with a
mutable `search_path`
([#196](https://github.com/sethschrage/growdy/pull/196)). It is security
invoker rather than definer, so it is not the classic escalation shape,
but a function resolving names against whatever path the caller brought,
inside a policy that decides tenancy, is not worth leaving to argument.

Not in this release, and deliberately: the iOS app itself. It builds, it
runs, native Google sign-in works, and it is not on the App Store --
Sign in with Apple is required alongside it before submission, and that
needs a paid developer account. Everything above reaches producers on
the web today; the shell is where it was tested, not where it shipped.

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

Two things UAT surfaced remain open and unfixed by this batch: the
embedding backlog, and artifact share links built from
`window.location.origin`, which resolve to `capacitor://localhost` inside
the shell and which `0029` records rather than fixes.

**Correction, same day.** This entry originally said memory recall "still
cannot work" while Voyage rejected the embedding job. That was wrong when
it was written, inherited from `0.12.0`'s entry rather than checked:
`producer_memory` held one row and it was embedded, so recall worked.
What was actually backlogged was conversation chunks -- 28 of 47 -- a
secondary surface. The throttle is gone too: adding a payment method to
the Voyage account lifted the 3 RPM free-trial limit, two manual runs
cleared the backlog to 47 of 47 with zero errors, and the 200M free token
grant still applies, so it cost nothing. The whole corpus is ~29K tokens,
0.015% of that grant. Left in rather than edited away, because a release
entry that quietly changes what it claimed is worse than one that shows
it was wrong.

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

The main arc starts from a question that had been named but never
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
