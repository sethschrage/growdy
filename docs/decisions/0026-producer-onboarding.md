# 0026. Self-serve producer onboarding

**Status:** superseded by 0028 -- the wizard is removed; onboarding returns with the purchase flow

## Context

Nothing has ever created a `producers`/`profiles` row automatically. The original tenancy migration (`0001`) said as much directly: "with no front-end, onboarding (creating a producer and attaching the first user to it) happens via service_role for now." Every profile that exists today, including Virgil's and every tester's, was inserted by hand outside the app. A second producer's onboarding flow sat on the deliberately-not-doing-yet list -- a real gap, not an oversight, waiting on evidence it was actually needed.

That evidence is now direct: a real Google account (`seth.schrage@gmail.com`) exists in `auth.users` with no matching `profiles` row, from a real sign-in that hit exactly this gap. `profiles.producer_id` is `not null`, and every feature in the app -- chat, forms, the data views, the write tool -- assumes a profile already exists. A sign-in with no profile doesn't get a clear error; it gets a string of queries silently returning nothing.

Two shapes were considered for what happens next: self-serve (anyone who signs in can create their own producer, no gate) versus invite-only (a producer is only created when an existing member or an admin explicitly invites them). Invite-only is the closer fit if per-user or per-producer billing arrives soon, as flagged in `0025`. Self-serve is simpler to build now and doesn't foreclose adding a gate in front of it later -- a paywall or invite requirement can sit in front of the same `create_producer_and_profile` call without changing its shape. Chosen: self-serve, on that basis.

## Decision

**One `SECURITY DEFINER` function, `create_producer_and_profile(p_producer_name, p_full_name)`, is the only way a producer and profile get created from the client.** `authenticated` holds no `INSERT` grant on either `producers` or `profiles` (confirmed: `SELECT` only on both) and none is added -- this follows the same shape `add_data_source` (`0019`) already established for "one narrow, atomic, self-service action that needs elevated privilege for exactly one purpose," not a general opening of either table to direct inserts.

The function is deliberately one-time-use per account: it raises if the caller already has a profile, so it can't be called again to create a second, orphaned producer for someone already onboarded. It also raises on a blank producer name rather than silently accepting one -- a producer with an empty name would work today (there's no `check` constraint) but reads as broken everywhere it appears.

**A new top-level gate, `SessionRouter` (`app/src/App.tsx`), decides between onboarding and the real app.** On sign-in, it looks up `profiles` for the current `auth.uid()`; a match renders `SignedIn` exactly as before, no match renders `OnboardingWizard` instead. This is the one place in the app that has to know onboarding exists -- every other component keeps assuming a profile already exists, which is now actually guaranteed for anything reachable past this gate.

**`OnboardingWizard` (`app/src/OnboardingWizard.tsx`) is two short steps, only the first mandatory.** Step one asks for a vineyard/business name and, optionally, the producer's own display name, then calls `create_producer_and_profile`. Step two offers to add a first parcel, with an explicit skip -- skipping isn't a dead end, since parcel creation also gets its own standing entry point (below), not just this one-time wizard screen.

**Self-serve parcel creation, deferred since `0025`, ships alongside this rather than separately.** `0025`'s own migration already added the `insert` policy allowing a producer to create their own parcels; nothing in the frontend ever called it. `AddParcel` (in `app/src/ProducerDataTree.tsx`) is a small "+ Add parcel" affordance at the top of the tree view, using the same insert path the wizard's second step uses -- one mechanism, two entry points (once during onboarding, any time after from the tree).

## Consequences

- A brand-new sign-in with no profile now gets a real, working path instead of a silent series of empty queries -- the gap this ADR closes was live and hit for real, not hypothetical.
- `create_producer_and_profile` is flagged by Supabase's own advisor as a `SECURITY DEFINER` function callable by `authenticated` -- expected and accepted, the same shape as the pre-existing `add_data_source`/`get_decrypted_source_secret` findings, not a new class of risk.
- No gate exists yet in front of self-serve creation -- anyone who signs in with Google gets their own producer, free, immediately. If billing per producer or per user arrives (`0025` already named this as a live possibility), it sits in front of this same function rather than requiring a redesign of it.
- `AddParcel`'s `producer_id` resolution uses `supabase.auth.getUser()` rather than a passed-down `session` prop, since nothing between `ProducerDataView` and `ProducerDataTree` currently threads one that deep -- a small, deliberate inconsistency with the rest of the codebase's convention, not worth a broader prop-threading refactor for one feature.
- Invite-only sharing already exists at the parcel level (`0025`) independent of this -- a producer who wants to bring someone else into their own data uses `parcel_shares`, not a second producer account. This ADR doesn't change that; it only closes the gap in how the *first* producer for a brand-new account gets created.
