# 0039. How the native client is built, tested and delivered

**Status:** accepted

## Context

[`0038`](0038-the-phone-gets-its-own-client.md) decided that the phone gets
a native SwiftUI client. It left three questions open on purpose, and
`AGENTS.md` said deciding them "is an ADR, not a preference you act on
quietly": where the project lives, how it is tested, and how it reaches the
phone.

A build prompt for the native client already existed and settled most of
them in passing. Before any Swift was written, that prompt was audited
against the code on 2026-09-22. Six researchers checked it against
`app/src`, the Edge Functions, the migrations, the live database and the
toolchain, and a second agent per area re-ran every citation and tried to
refute each finding. The prompt's instincts held up. Many of its specifics
did not, and several would have shipped bugs that fail silently:

- `URLSession.AsyncBytes.lines` drops the blank line that ends an SSE frame
  and splits lines at U+2028 and U+0085, which the server sends unescaped.
- Storage answers almost every error with HTTP 400, so "refresh on 401"
  never fires for a photo upload.
- A transcript saved as a string, rather than an array, stops both cron
  jobs for good once twenty such rows exist.

Each decision below was then put to the producer one at a time, with the
alternatives. This records the ones that shape the project. The backend
facts the audit found go into [`api-contract.md`](../api-contract.md) as
their own PR, step 1 of the build order below, because that is where a
second client reads them. Until that PR merges, where this ADR and the
contract disagree, this ADR is the newer statement.

One environment fact frames everything here. The project is on a free
Apple developer account (team `67L886WC2S`). Free provisioning:

- installs only onto devices paired with this Mac;
- stops a build launching seven days after its provisioning profile was
  created, not seven days after the build;
- allows three developer apps per device and ten new App IDs per week;
- cannot use push, iCloud or CloudKit, Sign in with Apple, associated
  domains or the extended-memory entitlements.

## Decision

### Where it lives, and how the code is divided

**`native/` at the repo root**, beside `app/`, `supabase/` and `docs/`. It
does not go in `app/ios/`, which belongs to Capacitor: `npx cap sync`
rewrites it and its `.gitignore` hides generated files. It is not a
root-level `ios/` either, which would sit next to `app/ios/` until cutover
and invite the wrong one in every path, prose and CI step. It is not a
separate repository, because a change to the API contract has to land in
the same PR as the code that depends on it, and the CHANGELOG, the docs
checks and the releases all live here.

```
native/
├── Growdy.xcodeproj
├── Config/            Base / Debug / Release .xcconfig
├── Growdy/            the app target: screens only
└── GrowdyKit/         a local Swift package: logic, tested on the Mac
```

**The rule is "logic in the package, screens in the app".** The package
starts with one library, `GrowdyCore`, holding:

- the SSE parser;
- the API layer;
- the wire models;
- the queue rules.

It imports nothing from UIKit, SwiftUI or Security, so `swift test` runs
it on the Mac host in seconds, with no simulator; a probe package did it in
7.8 s. The Keychain and GoogleSignIn stay in the app target behind
protocols, because they need a signed, entitled process.

**The map adds a second library rather than a second rule.** `GrowdyGeo`
arrives with the map and covers:

- geometry;
- decoding PostGIS's hex EWKB;
- recording and simplifying tracks;
- reading `.mbtiles`;
- turning plantings into map features.

It is tested on the Mac like everything else in the package. MapLibre is
imported only under `Growdy/Map` in the app target. It ships for iOS only,
so a package target depending on it would break Mac-side tests, and
keeping it out of `GrowdyKit` also keeps the heaviest dependency in the
project from reaching anything but the map screens.

**The Xcode project is authored in Xcode, with synchronized folder
groups**, so adding a file does not touch `project.pbxproj`. Build settings
live in `native/Config/*.xcconfig`, where a change reads as a diff. There is
no XcodeGen or Tuist: the part of the project that grows is already
described in Swift in `Package.swift`, and a generator would describe one
app target at the cost of a tool to install and pin locally and in CI. That
is worth revisiting if the module count ever reaches the dozens.

**Swift 6 language mode.** The app target defaults to the main actor. The
package is nonisolated, with `Sendable` types, and the byte-to-frame parse
path is marked `@concurrent`. Under Approachable Concurrency a nonisolated
async function otherwise runs on the caller's actor, and a long answer
parsed on the main thread would stutter the scroll it is streaming into.

### What it runs on

**The deployment target is iOS 26.0.** 26 is the lowest version with Liquid
Glass (`.glassEffect()`), the reason `0038` went native at all. It ran on
about four in five iPhones in June 2026. iOS 27 shipped on 2026-09-14 for
the same devices, iPhone 11 and later, and requiring it would exclude most
phones for months. It is 26.0 rather than the phone's 26.6.2, because the
floor is a promise to every producer, not a match for one handset.

**Screens and previews are checked on two simulators:** iOS 26.5, the
newest iOS 26 runtime Apple publishes and the closest to the phone's
26.6.2 (there is no 26.6 simulator), and iOS 27. Nothing runs on the
26.0 floor itself: the deployment target catches newer APIs at compile
time, not behaviour differences. The package's tests need neither
simulator, and CI's `xcode-27` image carries only iOS 27 ones. The
producer's phone is still the final check, because `0038` records three
touch bugs that passed the simulator and failed on the device.

**The free team stays until another producer needs the app.** Moving to the
paid program is the only way to reach anyone else's phone, and it ends the
weekly re-sign. It is deferred deliberately: nothing needs it while there
is one producer. Two things wait on it. **Sign in with Apple**, which App
Store guideline 4.8 requires beside Google and which
[`0029`](0029-ios-shell-and-native-sign-in.md) already calls a submission
requirement. And **the switch itself**. A new team can carry a new team
id, which breaks installing over the top, which forces a delete, which
erases whatever is still queued on the phone. So the switch has a
procedure:
1. Confirm nothing is waiting to send.
2. Copy the app's own data folder off the phone with `devicectl device
   copy from`; `CONTRIBUTING.md`, Releases step 2, has the command.
3. Delete the app and reinstall.

### How it is tested

**Swift Testing, for everything in `GrowdyKit`.** The rules carry over from
the web client's, adapted:
- every public function in the package has tests;
- every bug fix ships a test that fails without it;
- there are no snapshot tests.

The mechanics live in `CONTRIBUTING.md` under "Tests", which is where this
repo keeps rules.

**No scripted UI tests yet.** Swift Testing cannot drive a UI. That needs
XCTest's `XCUIApplication`, and on the phone a UI-test runner takes one of
the free team's three app slots. Screens are checked by using them, on the
simulator and on the phone.

**The Keychain adapter is checked on the signed phone build, not in the
tests.** Keychain access needs a signing team even in the simulator
([`0029`](0029-ios-shell-and-native-sign-in.md) found this as a bare
"keychain error"). The session logic is tested against an in-memory
`SecureStore`, and the adapter is the one thin piece exercised only by
signing in.

**The committed SSE fixtures are synthetic.** The repo is public, and a
recorded answer carries:
- the vineyard's data;
- the model's reasoning summary;
- memory-search queries and the tables read.

GitHub secret scanning is off, so nothing would catch a leaked token
either. The server's framing is one line of code
(`data: <JSON>\n\n`), so fixtures generated in exactly that byte format
reproduce the wire. They use invented text that deliberately includes:
- multibyte UTF-8, U+2028 and a lone surrogate;
- parallel tools that finish out of order;
- errors, an empty `done`, and a stream cut off with no `done`.

Every fixture is replayed split at every byte offset and fed one byte at a
time. One real recording, of a deliberately bland question, is kept
gitignored and used only locally, to prove the synthetic ones match a live
stream. CI rejects any fixture containing `eyJ`, `Bearer ` or
`refresh_token`.

**A `native` CI job, on GitHub's `xcode-27` image.** That image runs the
same Xcode build as the machine that builds the phone's app, 27.0
(`27A266a`), so CI compiles with the same compiler. It is a preview image
and can queue. The stable `macos-26` image would mean Xcode 26.6 and a
project file it may not open. The job has no path filter: it runs on every
PR and skips its steps internally when nothing under `native/` changed,
because a required check that never reports blocks every PR. The owner
makes it required once the PR that creates it has merged; that is a
branch-protection setting, not something a PR can do. `functions` was
added to the required checks on 2026-09-22; until then it ran on every
PR and gated nothing.

### How it reaches the phone

**Built with `xcodebuild -allowProvisioningUpdates`, installed over Wi-Fi
with `xcrun devicectl device install app`,** while the phone is on the
Mac's network. There is no cable step, no TestFlight and no App Store. If a
build expires in the field, the fallback is the web app in Safari.

**The seven days run from the profile's creation, not from the build.** On
2026-09-22 the shell on the phone had been rebuilt the day before, and it
still expired three days later, because Xcode reuses a cached profile while
it is valid. A fresh week needs a fresh profile: move the cached one out of
`~/Library/Developer/Xcode/UserData/Provisioning Profiles/` and build, and
Xcode requests a new one. That was done that day, and the shell's expiry
moved from 2026-09-25 to 2026-09-30.

**An expired build is re-signed and installed over the top, never
deleted.** Installing over the top keeps the data container. That was
checked the same day: the shell's container listing was the same before
and after (188 entries by `devicectl`'s count). Deleting the app deletes the container, including
anything queued.

**Crash reports come off the phone at each weekly re-sign**, using
`devicectl device copy from --domain-type systemCrashLogs`. A sideloaded
build has no crash feed. A crash log from the shell had been sitting unread
on the phone since 2026-09-20, and a crash on launch in the field looks
exactly like an expired profile. TestFlight's reports arrive with the paid
program. Uploading crashes to Supabase or a third-party service is a
separate decision, and `docs/monitoring.md` already calls it a bigger one.

**One version line for the product.** The native `CFBundleShortVersionString`
is the release tag's number (`X.Y.Z` of `vX.Y.Z`), and `CFBundleVersion`
is the git commit, so a build says exactly what it is. A commit hash is
not a valid App Store build number, so that half is revisited at the
paid-program switch, before the first TestFlight upload. A separate native tag stream would show up
in the frozen web app's What's new popup, which reads the latest GitHub
release, and would slip past the CHANGELOG check. Native changes get
release bullets only once the native app is what the producer opens.

**Settings shows the build and the date this install stops working**,
read from its own `embedded.mobileprovision`, with a banner a few days
before expiry. This replaces the web client's stale-version check, which
never worked on the phone: the shell serves a bundled `dist/`, so the page
it re-fetches is always its own. The maintenance half of the blocked screen
is kept exactly. It is polled with the publishable key alone, even when
signed in, so a dead session cannot hide it.

### How it talks to the backend

**A small layer of our own over `URLSession`, not supabase-swift.** Every
endpoint declares a retry policy:
- `.read` retries network errors and 503/520, the way `postgrest-js` does
  silently;
- `.idempotentWrite` is safe to replay;
- `.singleShot` is never retried.

Session refresh follows rules that are written down and tested:
- one refresh in flight at a time;
- the rotated token is persisted before it is used;
- any 4xx from the refresh grant means signed out;
- a generation counter, so a refresh cannot outlive a sign-out.

supabase-swift would hide exactly those rules. Its Auth client retries on
a fixed, package-scoped policy the app cannot change, one that includes
HTTP 500 and POSTs such as the refresh grant; its PostgREST client offers
only on or off over a built-in rule; and its retry layer was reworked in
a breaking commit the week this was decided (`f0d0d7bb`, 2026-09-17, not
yet released after v2.55.2). One `SessionStore` actor owns the tokens, and every request takes
its bearer from it.

**Google sign-in uses Google's `GoogleSignIn` package, with
`serverClientID` set to the web client id**, which keeps `0029`'s ID-token
flow. That makes the token's audience the web client, which Supabase
already accepts. The Supabase dashboard's Google provider was read, not
changed, on 2026-09-22:
- its Client IDs list holds the web client and the Capacitor iOS client,
  **not** the native one;
- "Skip nonce checks" is off.

So the native client's own id never reaches Supabase and needs no
dashboard change, and Supabase's iOS guide, which says to add the iOS id
and turn nonce checks off, is not followed.

**Signing out on the phone signs out only the phone** (`scope=local`). The
web app's sign-out is global and ends the phone's session too, so the phone
treats a revoked session as an ordinary signed-out state.

**The project URL, the publishable key and the Google web client id are
committed** in the native config. All three ship inside every copy of the
app, and none is a secret.

**The build order puts the session before the first live call:**

0. this ADR;
1. the contract corrections;
2. server-side conversation saving (below);
3. the project skeleton and CI;
4. the SSE parser;
5. the session and Google sign-in;
6. chat, v1 in full: History and reopening, both action cards, Report,
   reasoning, the sources and tokens line, the maintenance poll, and photo
   attach. The photo pipeline (JPEG encode, upload on attach and delete on
   remove, location at capture, metadata) lands here;
7. observations and the outbox, reusing that pipeline;
8. the map.

The server refuses every request except the maintenance poll without a
signed-in token, and borrowing the web app's refresh token is not a
shortcut: with rotation and reuse detection on (hosted: 10-second window,
confirmed 2026-09-22), a client that falls two or more rotations behind
ends the session for both on its next refresh. GoTrue forgives only a
token one rotation behind, and a phone asleep while the desktop refreshes
twice falls that far.

### Conversation saving moves to the server

Today the web client re-saves the whole `conversations.transcript`, and a
native client written the same way would too. Each has to get about ten
rules right. Among them:
- set `updated_at` itself, or the cron jobs never see the new turns;
- send the transcript as an array;
- send content as a string;
- never save an empty answer.

Three readers break in different ways when a client doesn't: the two
scheduled jobs and the web app's History. Two devices saving the same
conversation also overwrite each other silently. **Both clients will
append through a database function instead.** It takes a row lock,
validates each message, stamps the time with the server's clock, and
ignores a message it has already seen. Setting a report goes through a
second function, which also stores the report's optional note in a new
optional key. That is an exception to "the backend does not change"; it
was chosen over putting the same merge logic into two clients, and it gets
its own ADR and migration before native chat is built.

**The model's reasoning is saved with each answer**, as another new
optional key, by both clients: the web app's chat starts writing it too.
The phone shows it on the answer, and the desktop's History shows it
collapsed. The scheduled jobs read only role and content, so they ignore
it.

### What the phone keeps

**Anything waiting for the server is a plain file.** Each item is a folder
under `Application Support/Outbox/`, holding an atomically written
`item.json` with a schema version, plus `photo.jpg` for a capture. One
actor owns the folder. There are three kinds:
- queued observations;
- questions that could not be sent;
- conversation turns not yet saved.

Unsaved turns go to the conversation-saving function when signal
returns, each message carrying its own id so a repeat is ignored. They
flush before any queued observation that refers to the same
conversation, because an observation cannot reference a conversation
the server does not have yet, and an answer shows a quiet "not saved
yet" until then.

This replaces the original prompt's SwiftData. The queue is a handful of
write-once records with no queries. A SwiftData store that fails to migrate
after an update fails at launch, and the usual quick fix, deleting the
store, drops captures that
[`0037`](0037-what-happens-with-no-signal.md) promises are never dropped. A
file that won't decode is moved aside and shown, never deleted. The photo
is already a file, which is what a background upload needs, and an item
can be pulled off the phone with `devicectl` if something goes wrong.

**Only a server rejection counts toward "stuck"**; no signal and an
expired token never do. A stuck item offers Try again beside a separate,
deliberate Delete.
This amends `0037` (see its update).

### Where the native client deliberately differs from the web one

Each of these is a place where copying React would be copying a workaround
or a bug. They are written down so nobody "fixes" the native client back to
matching it.

- **A cut-off answer is not saved.** A stream that ends with neither `done`
  nor `error` is shown as cut off, with Retry, and nothing is persisted for
  it. React saves it as a complete answer, which the model then rereads as
  its own finished work.
- **The app owns an answer in progress, not the screen.** It survives
  navigating away and a short trip to another app, and it saves itself. A
  view's task is cancelled when the view disappears, and the server never
  saves answers.
- **A failed send retries by itself once, and only when the request
  provably never left the phone** (no internet, host not found, DNS
  failure, could not connect). Anything else shows "Not sent" with a
  Retry that warns it may cost a second answer. There is no buffered
  non-streaming path. React falls back to one when a send fails before
  the first frame; it was first seen in the shell as "Load failed", but
  the cause is intermittent transport, which URLSession shares, and the
  fallback can bill a second model turn.
- **An unsent question is kept on the phone**, across the app being
  closed, and can always be sent by hand. It is sent automatically only
  after a transport failure, never after the server refused it, and only
  on an observed no-signal-to-signal change. NWPathMonitor's first report
  does not count, and neither does any other network event.
- **Stop exists, and promises nothing about cost.** It ends the answer
  on the phone. A stopped answer is not saved and is not retried
  automatically. The chat function has no disconnect handling, and nobody
  has checked whether Supabase's runtime stops it when the phone goes
  away, so the step in progress is paid for either way and at worst every
  remaining step runs too. The screen does not suggest Stop saves money.
- **A conversation resumes on launch unless it has been idle about six
  hours**, the cron cadence. A long one gets a gentle suggestion to start
  fresh. Nothing is ever trimmed silently.
- **Feedback is one Report action with an optional note.** It is saved as
  `feedback: 'down'`, which the web app and `docs/monitoring.md` §2 already
  read, and the note goes in the new optional key above. Nothing reads a
  thumbs-up.
- **The "Send for review" card goes through the queue**, with an id
  derived from the conversation, the message and the card. A second tap,
  a retry or a reopen from History then files nothing new. In React it
  bypasses the queue and has no replay protection.
- **The "Confirm this change" card draws itself from the proposal's real
  status**, and Decline only applies to a proposal that is still pending.
  In React, a reopened conversation offers live buttons on edits already
  applied. Confirm is sent once and never retried automatically (contract
  §1); after a transport failure the card re-reads the proposal's status,
  since the change may have been applied, and shows an error only if it
  is still pending.
- **A photo's name is fixed when it is taken**, so a retried upload lands
  on the same object instead of orphaning a copy.
- **Photos always go through a fresh JPEG encode.** Anthropic rejects
  HEIC, and nothing on the phone does the conversion the Capacitor plugin
  did.
- **Each photo stores its taken-at time and its own GPS as metadata**, on
  every upload path.
- **The full-resolution original goes to the Photos library** with its
  location intact. The shell's copies, despite a comment saying otherwise,
  carry neither.
- **No permission to read the photo library.** Apple's picker needs none.
  It is asked for the photo's current encoding, and the app does its own
  JPEG encode. This holds only if a geotagged HEIC picked on the phone
  keeps its taken-at time and GPS; that is checked on the phone before
  the photo work is final, and this is revisited if it fails. The
  skeleton's Info.plist carries `NSPhotoLibraryAddUsageDescription`
  (add-only, for the original above) and no library-read string.
- **The map's walking track will keep "While using" location**, with a
  background session while recording, never an "Always" prompt. This is
  confirmed when the map is built.

## Alternatives considered

- **A separate repository:** rejected. Contract changes could no longer
  land beside the code that depends on them.
- **A single app target:** rejected. Every test would build the app and
  boot a simulator, and nothing would stop the map reaching into chat.
- **A package per feature:** more boundaries than the code has yet. The
  package grows a library when a feature needs one. The producer raised
  how the code stays organised long-term once the GIS work lands;
  `GrowdyGeo` is the answer so far.
- **XcodeGen or Tuist:** a tool to pin in two places, to describe one
  target.
- **SwiftData for the outbox:** a launch-time failure mode for a few rows
  that never need a query.
- **supabase-swift:** hides the retry and refresh behaviour this client is
  meant to state and test.
- **A hand-built browser sign-in, or Supabase's hosted page:** either would
  need a change in the Supabase dashboard and would undo `0029`'s choice.
- **Joining the paid program now:** a real option, and cheap. Deferred
  only because nothing needs it until a second producer does.
- **`macos-26` for CI:** a stable image, but a different compiler from the
  one that builds the phone's app.
- **Committing scrubbed real recordings:** realistic, but in a public repo
  one missed line is permanent.

## Consequences

- **The phone has an app that expires weekly** until the paid program.
  Re-signing needs the phone near the Mac. The expiry date is on screen
  instead of discovered.
- **There is no App Store path yet.** Sign in with Apple waits for the paid
  team, and the App Store requires it.
- **The web app changes, narrowly.** Conversation saving moves to the
  server function, and it saves the model's reasoning with its own answers
  and shows it, collapsed, in History (`0038`'s update). A
  frozen client that has to keep shared data correct is not entirely
  frozen.
- **The backend changes once**, for conversation saving, with its own ADR.
  Everything else a second client needs is already there.
- **Two copies of every UI decision**, as `0038` said. This ADR is the list
  of the ones where the two apps behave differently on purpose.
- **An engineer who knows only React has to read this first.** Several of
  these rules look like over-engineering until the web behaviour they
  replace is traced to a lost answer, a duplicate observation or a
  signed-out producer.
