# 0027. Sharing a chat graphic via an unguessable public link

**Status:** withdrawn 2026-09-21 -- the feature is removed outright, not replaced; see "Withdrawn (2026-09-21)" below

## Context

The chat can render an actual picture (`0021`) and, since real use asked for it, share one beyond the chat window entirely -- to a co-op, a buyer, anyone without a Growdy account. Every table in this schema up to now is producer-scoped and RLS-locked; there is no signed-out surface anywhere in the app. Confirmed directly against user preference before building: an unguessable link with no login, the same model as a Gist or a shared Figma link -- not a login-gated share, and not deferred until a private "saved artifacts" concept exists.

The real design question isn't the mechanism (Postgres already has cryptographically random `uuid`s), it's how to expose *anything* publicly for the first time without opening a door wider than intended. A chart built from real vineyard data (yields, weather, planting positions) is exactly the kind of content this project has otherwise kept strictly behind RLS -- a producer choosing to share one specific graphic shouldn't accidentally make every producer's shared graphics discoverable.

## Decision

**`artifacts`: one row per shared graphic, `id uuid` doubling as the link itself.** `producer_id` (owner), `conversation_id` (nullable, which chat session it came from, mirroring `observations.conversation_id`), `title`, `content` (raw SVG). No `public`/`private` flag -- every row that exists is a public artifact; there's no unshared-but-saved state to model yet. If that need shows up for real (the artifacts panel, `0.14.0`), it's a later migration extending this one, not something guessed at now.

**The actual public read path is a single `SECURITY DEFINER` function, `get_public_artifact(p_id)`, not an RLS policy granting `anon` access to the table.** This is the one real insight this ADR turns on: RLS filters *rows*, not *query shape* -- a policy like `using (true)` for `anon` would let anyone list every artifact ever shared (`GET /artifacts?select=*`), not just fetch the one they already hold the id for. A function call can't be turned into a listable collection the same way a REST table endpoint can; `get_public_artifact` takes exactly one `uuid` and returns exactly one row or none. This reuses the same narrow-RPC shape `add_data_source` and `create_producer_and_profile` already established for "one specific privileged action needs elevated access" -- applied here to a privileged *read* instead of a write. `anon` gets no grant on `artifacts` at all; the table stays default-deny, same as every other table in this schema.

**The owner also gets an ordinary RLS `select`, scoped by `user_can_access_producer`**, alongside the `insert` policy that actually lets a producer create one. Nothing yet reads this list from the app (the artifacts panel is `0.14.0`), but its absence would be a real foot-gun -- a producer with no way to confirm their own artifact exists through the app at all, forced to trust an insert silently succeeded.

**Sanitization happens at render time, not at write time.** `content` is stored as whatever SVG the model wrote; the public view and the in-chat view both run it through the same `DOMPurify` call `SvgGraphic` already established (`0021`) before it ever reaches the DOM. Storing "already sanitized" markup and trusting that flag forever would be more fragile than re-sanitizing on every read -- a stored, ever-after-served-verbatim public artifact is a more attractive stored-XSS target than an ephemeral chat render, not a less attractive one.

**No router library.** This app has never had client-side routing; adding one for a single static path would be disproportionate. `App.tsx` checks `window.location.pathname` for a `/a/:id` prefix before any auth/session logic runs at all, and renders a dedicated `PublicArtifactView` if it matches -- the one place in the app that has to work for a signed-out visitor. A `vercel.json` rewrite (`/(.*) -> /index.html`) is required alongside this: confirmed directly that without one, Vercel's static file server 404s on any path other than `/`, since this project has no existing SPA-fallback config.

## Consequences

- This is the first table in the project `anon` can reach at all, even indirectly -- worth remembering as the bar for any future public-facing feature: a narrow function, never a table grant.
- `get_public_artifact` is flagged by Supabase's advisor as callable by `anon`/`authenticated` -- expected and accepted, the same shape as every other `SECURITY DEFINER` finding already in this project.
- A producer sharing a graphic built from their own data is trusting themselves with that judgment call, the same way exporting a conversation to a file already does (`HistoryDrawer`) -- this ADR doesn't add a warning or confirmation step beyond the share action itself; that's a UI decision that can change without touching this schema.

## Update: the artifacts panel closes the revocation gap

This ADR originally shipped with links as permanent and un-revocable, naming a `delete` policy for the owner as the fix "if revocation becomes a real need." The panel promised for `0.14.0` (`ArtifactsView`) is that real need -- a producer browsing everything they've ever shared with no way to remove anything is a real gap, not a deferred nice-to-have, once they can actually see the list. Added directly: `delete` RLS for the owner (`user_can_access_producer(producer_id)`, the same check every other policy on this table already uses) and a `grant delete ... to authenticated`. No new risk surface -- the same owner check that already governs `select`/`insert` now also governs `delete`.

`ArtifactsView` itself reuses `ProducerDataView`'s modern visual language (`.pdv-*`) rather than the pixel-art chat chrome, per the original roadmap note for this panel ("a second visual language... deliberately distinct") -- concretely, this means `ArtifactsView` lives inside a `.pdv-overlay` and its detail view reuses `.pdv-detail-*` (the same bottom-sheet/modal `PlantingDetail` already established), rather than inventing a third design language.

## Withdrawn (2026-09-21): removed, not replaced

All of it is gone -- the `artifacts` table, `get_public_artifact`, the `/a/:id` route, `PublicArtifactView`, `ArtifactsView` and the share action that fed them. Nothing took their place: no flag, no login-gated successor, no private saved-graphics panel holding the shape open. The drawing half this ADR was built on top of went in the same pass (`0021`), since a picture nothing can save or share is just the chat bubble it was capped to fit.

The reason is the client. This ADR's whole value was a page someone with no Growdy account and no app installed could open in a browser, and the app the producer actually uses is on a phone -- now heading for a native iOS client rather than the Capacitor shell `0029` wrapped. A signed-out web page is precisely the capability that does not come along: sharing one would mean keeping a web build alive for a single feature the producer has never once reached from the app they open. Carrying it forward is a decision to maintain two clients, and that is a bigger commitment than the feature has earned.

The evidence agrees with the architecture. Two artifacts were ever saved -- both untitled, 2026-09-17 and 2026-09-18, both written while this ADR was being built -- and the producer's own verdict on them was that they "aren't good anyways." So the widest door this schema has ever opened was opened for something nobody used twice. If drawing a picture turns out to be what a question really needs, it gets built again for the client that exists then, rather than kept alive as a stub in the meantime.

What survives is the mechanism, not the feature. A narrow `SECURITY DEFINER` function taking one id and returning one row -- never an RLS grant to `anon`, which filters rows and not query shape -- is still the bar for the next public-facing thing this project builds, and the Decision above is still where that reasoning is written down.
