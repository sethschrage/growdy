# 0037. What happens with no signal

**Status:** accepted

## Context

A producer asked what the app does when there is no connection. The
answer, checked rather than assumed, was: nothing deliberate. A search of
`app/src` for any handling of connectivity returned one unrelated mention
inside the Google sign-in code and nothing else.

So, standing in a block with no bars:

1. The question appeared in the transcript, and the write that saves the
   transcript failed silently --- and, because `started.current` was set
   before the create rather than after, every later write in that
   conversation then updated a row that had never been created.
2. The request failed. Since
   [`0035`](0035-what-the-docs-are-checked-against.md)'s sibling change
   added a buffered fallback it failed twice, which is harmless and
   slightly absurd.
3. The producer saw `Load failed` --- WebKit's words for a dead socket
   --- with no explanation and no way to send the question again except
   to type it a second time.
4. Logging an observation, uploading a photo and the status poll all
   failed the same way.

This is a vineyard app. A producer with no signal is not an edge case; it
is a Tuesday.

## Decision

Three things, of which only the first two are built here.

**The app says which situation it is in.** `isOffline()` and
`describeSendFailure()` in `app/src/lib/connectivity.ts` turn a
transport failure into a sentence about the producer's circumstances
rather than the browser's: *"No signal. Your question is saved, and will
send as soon as you are back."* A message the **server** composed is
always preferred over anything this side invents --- "Anthropic rate
limit reached" is specific and true, and replacing it with something
generic would be a downgrade. Only the transport's own strings, which
every browser words differently, get replaced.

**A question that did not send is kept, and sent again.** The failed
attempt is held whole --- the transcript it belonged to and the photo
that travelled with it --- so the retry is the same request rather than a
reconstruction. It goes automatically when the browser reports the
connection back, and there is a button for when the browser is wrong.
The transcript write is now allowed to fail quietly, because the next
turn writes the whole transcript again: a missed write heals itself.

**Observations queue locally --- not built here, and specified below.**
This is the one that matters and the one with real decisions in it, so it
gets its own work rather than being smuggled into a fix for error copy.

## The observation queue, specified

What a producer needs: to stand in front of a vine with no signal, say
what they see, photograph it, and have that arrive when they are back at
the house. What the app currently offers is a failed RPC.

The shape, when it is built:

- **The queue holds observation candidates, not observations.** Every
  observation already enters through
  [`0030`](0030-every-observation-through-one-queue.md)'s review queue,
  so an offline capture is the same object arriving by a slower road ---
  no second write path, and no new way into `observations`.
- **IndexedDB, not `localStorage`.** Photos are the point, and they are
  megabytes.
- **The photo is queued as bytes and uploaded on flush**, because the
  storage path carries the tenancy check and a path handed out offline
  cannot be verified.
- **GPS is captured at capture time**, not at flush. A point recorded
  when the phone reconnects at the house is a lie about where the vine
  is, and this project has already been bitten by a photo whose location
  was silently absent ([`0030`](0030-every-observation-through-one-queue.md)).
- **A queued item is visible as queued**, and says so in the observation
  log. A silent queue is indistinguishable from data loss.
- **Flush is idempotent.** Each queued item carries a client-generated
  id, and the RPC takes it, so a flush interrupted halfway does not
  produce two candidates. This is the decision most likely to be got
  wrong by writing the queue first and thinking about it after.

## Alternatives

**A service worker and full offline-first.** The chat cannot work
offline --- the model is on the other side of the network --- so
offline-first would mean a shell that loads and an app that cannot answer
anything. The honest scope is capture, not conversation.

**Retry with a backoff timer instead of waiting for `online`.** Timers
fire while the phone is in a pocket in a dead spot, burning battery to
learn nothing. The browser already knows when the radio came back.

**Say nothing and let it fail.** What it did until now. It is defensible
only while nobody is standing in a field, which is not what this app is
for.

## Consequences

- **Nothing about the chat works offline, and it now says so** rather
  than implying a fault. That is the whole of the improvement for chat,
  and it is worth more than it sounds.
- **`navigator.onLine` is trusted only when false.** It reports true for
  a phone connected to a network that goes nowhere, so the automatic
  retry can fail; that costs one request and leaves the button in place.
- **The queue is still missing.** Until it is built, an observation made
  with no signal is lost the moment the screen is dismissed, and this ADR
  is the record that it is a known gap rather than an oversight.
