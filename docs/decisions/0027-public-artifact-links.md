# 0027. Sharing a chat graphic via an unguessable public link

**Status:** accepted

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
- A shared link is permanent and un-revocable for now -- there's no delete/unshare path yet, matching the "every row is public" scope decision above. If revocation becomes a real need, it's a `delete` policy for the owner, not a schema change.
- `get_public_artifact` is flagged by Supabase's advisor as callable by `anon`/`authenticated` -- expected and accepted, the same shape as every other `SECURITY DEFINER` finding already in this project.
- A producer sharing a graphic built from their own data is trusting themselves with that judgment call, the same way exporting a conversation to a file already does (`HistoryDrawer`) -- this ADR doesn't add a warning or confirmation step beyond the share action itself; that's a UI decision that can change without touching this schema.
