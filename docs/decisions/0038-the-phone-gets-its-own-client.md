# 0038. The phone gets its own client

**Status:** accepted

## Context

growdy has had one client since it started: a React app in `app/`,
wrapped in a Capacitor shell so it can be installed on a phone. That was
the right shape for a chat app with a few screens, and it is still the
reason the project got this far with one person building it.

The decision to change it came from a night of evidence rather than a
preference, so the evidence goes here.

**Fighting the web view is a standing cost, and it is measurable.** Four
hundred and thirty-six lines of client code exist for no reason except
that a `WKWebView` will not do what a phone does:

| | lines |
|---|---|
| [`lib/press.ts`](../../app/src/lib/press.ts) and its tests | 247 |
| [`lib/keyboard.ts`](../../app/src/lib/keyboard.ts) and its tests | 141 |
| the keyboard block in [`capacitor.config.ts`](../../app/capacitor.config.ts) | 29 |
| `visualViewport` mirroring in [`main.tsx`](../../app/src/main.tsx) | 19 |

None of it is a feature. `press.ts` exists because WebKit drops `:active`
the instant a scroller claims a gesture and never gives it back.
`keyboard.ts` exists to mirror a keyboard height into a CSS variable so a
bar can be moved by hand. In SwiftUI the second of those is
`.ignoringSafeArea(.keyboard)`.

It is not a one-off, either: **six of the forty-two commits in `0.15.0`
were keyboard, gesture or touch fixes** --- `#218`, `#223`, `#226`,
`#227`, `#231`, `#232` --- and three of those were bugs that passed in
the simulator and failed on a real phone, all three with the same cause,
which is that iOS stops delivering `touchmove` once the native scroller
takes a drag.

**There is a ceiling, and it was measured rather than assumed.** A
producer asked for the edge refraction in iOS 26's Liquid Glass: the
magnification where text behind the glass bends at the rim. A probe was
built with four cells and run on the device. `backdrop-filter: blur()`
works. `backdrop-filter: url(#svgFilter)` is **silently ignored** --- the
backdrop passes through untouched. The identical filter applied as
`filter:` to the element's own pixels works fine. So WebKit will displace
an element's own content and will not run an SVG filter over a backdrop,
and `blur`, `saturate` and `brightness` are the whole vocabulary
available. The effect is reachable natively in one modifier
(`UIGlassEffect`, `.glassEffect()`) and is not reachable from a web view
at any price. Three hours went into establishing that.

**The map is where this stops being about polish.** A vineyard map with
offline tiles and a track you can record while walking rows is the next
real feature, and it is the case web views are worst at: gigabyte-scale
`.mbtiles` under web-view memory management, a heavy canvas competing for
touch with sliding DOM panels, and background GPS. That last one is not a
future concern --- the app **already** records location when an
observation is sent, and it works today only because the producer is
holding the phone with the app open.

The gesture collisions this predicts are not hypothetical either. `#232`
was titled *"the keyboard drag survives the scroller taking the gesture"*
and `press.ts` exists for the same reason. Those are exactly the
touch-event collisions a drawer over a live map produces --- and growdy
has already hit them with a text box over a scrolling list of messages. A
MapLibre canvas is far more aggressive about swallowing touch than a
`div`.

## Decision

**The iOS app is rebuilt as a native SwiftUI client, and it becomes the
full-featured one.** New work goes there.

**The React app is frozen, not deleted.** It stays deployed and working
as a desktop surface --- reviewing vineyard data, history, the producer
tree on a real screen --- and receives no new features. It is rebuilt
later, when there is a reason, as a second thin client against the same
API. Not on a schedule.

**Everything that is not a user interface stays exactly where it is and
is shared by both.** The Postgres schema and its RLS, the Edge Functions,
the auth model, the prompts, and --- when the map arrives --- one map
style file that both clients render from. That is roughly two thirds of
the system by the measure that matters: 2,095 lines of Edge Functions and
seventy-odd migrations are untouched by any of this, and 9,111 lines of
React and CSS are what gets left behind.

## Consequences

**This is a second implementation, not a port.** SwiftUI does not
transpile to the web and the reverse is not a thing either. Tokamak plus
SwiftWasm is the closest anything comes, and it is a SwiftUI-*compatible*
API rendering to the DOM from a community project --- it would reproduce
none of the rendering this move is for. What carries between the two
clients is the API and the design, never code. The later web client is a
rewrite that happens to already know what the product is, which is when a
second client is cheapest to write.

**The API contract has to be written down, and currently is not.**
`app/src/data/` has been the only specification of what the Edge
Functions accept and return --- the SSE event types the chat streams, the
RPC signatures, the error shapes. One client can get away with that
because the client *is* the spec. Two cannot. This is the first real debt
this decision creates and it should be paid before SwiftUI work starts.

**Native-first is unusually safe here, for a reason specific to growdy.**
The normal risk of building against one client is that the API quietly
absorbs that client's assumptions and the second client fights them
later. This API has served a web client in production for months, so the
contract is already proven client-agnostic. The web app being the
*first* client is what makes it safe to make the native one second.

**The browser stops being the verification surface.** A good deal of this
project's checking has been a page in `app/public/` rendering real
components against the real stylesheet so geometry could be measured
rather than eyeballed. Xcode Previews and the simulator replace it, and
they are better at it --- but the habit has to move, not lapse.

**Anyone using growdy in a browser stops getting new features** for as
long as the rebuild takes. With one producer, on a phone, that costs
nothing today. It would not stay free.

**Two clients means two of every UI decision**, and that is the real
price. It is accepted on the same grounds onX Hunt and every other heavy
mapping app accepts it: a 27-inch screen for reviewing and a 6-inch
screen in the sun with gloves on want different interfaces, and one
interface stretched across both is worse at each.

## Alternatives considered

**A scoped native compose bar, React everywhere else.** This was
recommended first and then withdrawn the same evening. It gets real glass
and real spring physics exactly where the fighting was, for a few hundred
lines rather than a rewrite. It fails on what comes next: with a map
coming you would build a native bar, then a native map, and still have a
React chat wedged between two native surfaces --- three sets of gesture
and layer-ordering problems instead of one.

**Stay hybrid and accept the ceiling.** Defensible right up until the
ceiling was measured. Once the refraction probe came back, the choice was
no longer between good and better; it was between a thing that is
possible and a thing that is not, with a map coming that lands squarely
in the same category.

**React Native.** The strongest alternative, and it is not obviously
wrong: it gives native gestures, a real native map through MapLibre's
bindings, and one UI codebase for phone and web. It is rejected on the
interaction bar rather than on capability. The reason for moving is that
Apple's own components are the target --- `.glassEffect()`,
`.sheet(detents:)`, the sheet-over-map behaviour that runs on the system
compositor --- and React Native reaches those through a bridge, arriving
late and approximately. Choosing it would mean learning a new framework
to get an approximation of the thing the move is for.

**Tokamak / SwiftWasm, to share one Swift UI codebase.** Covered above.
SwiftUI does not run on SwiftWasm; plain Swift logic does. Worth
remembering if business logic ever wants sharing; useless for interface.

## Update (2026-09-22): the contract is written down

This ADR said the API contract "should be paid before SwiftUI work starts."
It is: [`api-contract.md`](../api-contract.md), covering 51 calls across the
Edge Functions, PostgREST, storage and auth.

Writing it found more than it recorded. Three things a Swift client would
have got wrong by reading `app/src/data/` carefully and believing it:

- **`postgrest-js` retries reads and not writes**, three attempts on 503/520,
  on by default, and nothing in growdy turns it off. None of that is visible
  in any growdy source file. A client written from the call sites alone has
  no retry at all, which is a regression for a vineyard with one bar --- and
  adding it to the write side to compensate would be wrong, because the
  writes are single-shot on purpose.
- **Storage has no UPDATE policy**, so `upsert: true` is a 403 rather than an
  overwrite. The omission is deliberate: overwriting bytes would let the
  evidence behind a confirmed observation change while the row still reads
  the same path.
- **`usage` arrives once per model turn, not once per request**, so a client
  that assigns rather than sums under-reports cost on every answer that used
  a tool.

The last one is the shape of the problem this ADR predicted. Each was
recoverable only by reading code that no client-side type system covers ---
a vendored dependency, a migration, and a loop inside an Edge Function --- and
each looks like a working implementation until it does not.

One open item the contract names rather than solves: the stale-version check
re-fetches `index.html` and scrapes a `<meta>` tag, which has no native
analogue. It is the only thing that currently tells a producer their app is
running old code, and it needs a deliberate replacement rather than a silent
drop.


## Update (2026-09-22): the freeze bends, narrowly

The React app is still frozen, with two exceptions, both decided with the
producer while settling [`0039`](0039-how-the-native-client-is-built-tested-and-delivered.md):

- **It changes where shared data would otherwise go wrong.** The web
  client rewrites the whole of `conversations.transcript` on every save,
  so two devices continuing one conversation (the desktop and the phone's
  shell, today) silently erase each other's turns, and a native client
  saving the same way would do the same.
  Conversation saving moves to a database function that both clients call
  --- the first exception to "everything that is not a user interface
  stays exactly where it is" above, and it gets an ADR of its own before
  it is built.
- **It changes for review features that fit the job this ADR gave it.** The
  desktop is where a producer reviews "vineyard data, history, the
  producer tree on a real screen". The model's reasoning will be saved
  with each answer, as a new optional key, by both clients -- so the web
  app's chat writes it too -- and History will show it, collapsed.

Everything else stays frozen: no new capture, chat or map features.

**A correction to the update above.** It says the stale-version check "is
the only thing that currently tells a producer their app is running old
code". That is true of a desktop tab and was never true on the phone: the
Capacitor shell serves a bundled copy of `dist/`, so the `index.html` the
check re-fetches is always the running build's own, and the comparison
cannot differ. The native client replaces it with the build and its expiry
date on screen (`0039`), not with a port.
