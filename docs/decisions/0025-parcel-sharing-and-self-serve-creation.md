# 0025. Per-parcel sharing, cascading through the hierarchy it owns, plus self-serve parcel creation

**Status:** parcel sharing withdrawn by 0028, UI and all -- the mechanism shipped in 0.10.0, got a real UI (plus a genuine fix to the RLS cascade it depended on) hours before UAT, and was then removed outright because parcels became the thing Growdy sells. Self-serve parcel creation, the other half of this ADR, was removed by 0028 as well, for the same reason.

## Context

Today a parcel has exactly one producer, full stop -- `parcels.producer_id`, checked the same way every other table in this schema is: `private.user_can_access_producer(producer_id)`, isolated behind that one function specifically so the membership model could change later without touching every RLS policy (`0001`). `0001` already named the fallback it expected: a `user_producers` join table, for a user who needs full access to more than one producer's entire account (its own example: "a consultant working across several operations").

That's not what's being asked for here. The real shape is narrower and different: a specific parcel's owner shares *that parcel* with another producer -- a landowner giving the company farming their land visibility into it, or the reverse -- without either side getting access to the other's unrelated parcels, producers, or accounts. `0001`'s planned join table would grant too much (everything under the other producer); this needs a grant scoped to one resource, not one whole tenant.

Self-serve parcel creation doesn't exist at all today -- every parcel so far was created directly against the database for one real producer. Wanted now, independent of sharing.

Also named directly: parcels and/or users may become billable later. Not building billing here, but the schema this ADR adds needs to make "how many parcels does this producer own" an unambiguous, cheap question -- a share must never make a parcel count against more than one producer.

Working out the actual mechanism surfaced a real complication: this schema denormalizes `producer_id` onto every table *specifically* so RLS never has to walk the hierarchy (`docs/data-model.md`'s own stated reason). That's exactly what breaks a parcel-level share -- a plot, planting, or observation's RLS check is `producer_id = you`, entirely independent of which parcel it sits under. Sharing `parcels.id = X` does nothing for that parcel's own plots or plantings unless something new checks the *parcel* relationship, not just the row's own `producer_id`.

## Decision

**`parcel_shares`: one row per grant, from a specific parcel to a specific other producer.**

```
parcel_shares
  id uuid PK
  parcel_id uuid FK -> parcels
  shared_with_producer_id uuid FK -> producers
  role text check (role in ('editor', 'viewer'))
  created_at timestamptz
  unique (parcel_id, shared_with_producer_id)
```

`'owner'` is deliberately not a value here -- the parcel's real owner is already `parcels.producer_id` itself, unchanged. A share only ever grants `editor` (can log/edit data for that parcel) or `viewer` (read-only), matching the Owner/Editor/Viewer model directly: Owner is who the parcel actually belongs to, Editor and Viewer are what a share can grant.

**Access cascades down through the hierarchy a parcel actually owns, via a small family of helper functions, not by inlining a join into every policy -- the same isolation discipline `0001` already established for producer membership.**

- `private.user_can_access_parcel(parcel_id)` -- true if the caller's producer owns the parcel *or* holds any share (`editor` or `viewer`) on it.
- `private.user_can_edit_parcel(parcel_id)` -- true only for the owner or an `editor` share; a `viewer` share fails this one.
- `private.user_can_access_plot(plot_id)` -- resolves to the plot's `parcel_id`, then defers to `user_can_access_parcel`. Needed because `plot_rows` only reaches a parcel through `plot_id -> plots`, not directly.

`plots.parcel_id` and `planting.parcel_id` are direct, so their `select` policies become `using (private.user_can_access_parcel(parcel_id))` outright -- this is a strict superset of the current `user_can_access_producer(producer_id)` check (still true for the owner, now also true for a valid share), not a narrowing. `plot_rows` gets `using (private.user_can_access_plot(plot_id))`. Any existing `insert`/`update`/`delete` policy on these tables gets the `_edit_` variant instead, so a `viewer` share can see data but never change it.

**`observations` is the one real edge case, because `planting_id` is nullable (`0014`) -- a general note isn't always about a specific plant, and therefore isn't always under a specific parcel at all.** Chosen depth (confirmed directly, not assumed): a share reaches an observation *only* when it's actually tied to a planting under that parcel (`planting_id` set, resolved through `planting.parcel_id`); a general observation with no `planting_id` stays visible only to the owning producer, since it was never really about that parcel to begin with. This is a real, deliberate scope limit, not an oversight -- a landowner sharing one parcel shouldn't see a general field note about a completely different part of the operation just because it happened to log against the same producer.

**Self-serve parcel creation**: a straightforward `insert` policy on `parcels` (`with check (private.user_can_access_producer(producer_id))`), so a producer can create their own parcels directly -- no new RPC needed, since there's no credential or side effect involved the way `add_data_source` has.

**Billing stays unambiguous by construction, not by convention**: a parcel is owned by exactly one `producer_id`, exactly as today; `parcel_shares` never changes that column or creates a second owner. Counting "how many parcels does producer X own" is `count(*) from parcels where producer_id = X` -- a share never appears in that count, on either side, because ownership and sharing are two different columns on two different tables. Same reasoning would apply to a future per-user count on `profiles`, unaffected by any of this.

**Two things caught by deliberately re-auditing this design before writing any code, the same way the `profiles.producer_id` gap (`0022`'s follow-up) was found -- both closed here rather than left as risks to remember later:**
- **No `UPDATE` on `parcel_id` or `shared_with_producer_id`, ever.** The exact shape of the `profiles` bug -- a row you're allowed to touch, updated to point somewhere it shouldn't -- applies just as directly to a share row: letting `parcel_id` or `shared_with_producer_id` change after creation would let an owner retarget an existing share at a different parcel, including one they don't own. `authenticated` is granted `UPDATE` on the `role` column only (`grant update (role) on public.parcel_shares to authenticated`) -- never a table-wide grant later narrowed by policy. Changing *what's* shared or *who* it's shared with is delete-and-recreate, not update.
- **A share only reveals its own row, not the whole parcel's sharing list.** The parcel's owner can see every share on their own parcels; a producer holding a share sees only their own row, never who else has access to that same parcel. Without this, a viewer share would let a producer enumerate every other producer with access to a shared resource -- a real information leak unrelated to the actual data-access question this ADR answers.

## Consequences

- A parcel's own RLS gains an `or` branch (owner or share) -- no existing access is narrowed; this is purely additive to who can see or edit a given row.
- Real risk surface moves to `parcel_shares` itself: a bug that lets a producer create a share row for a parcel they don't own would let them hand out access to someone else's land. The `insert`/`delete` policy on `parcel_shares` has to check `private.user_can_access_producer(producer_id)` on the *parcel being shared*, not on the share row's own fields, the same care `0022` already named for any column that controls access scope.
- `weather_observations` and other channel-fed tables are untouched by this -- they're scoped to a `data_sources`/`producer_id` relationship that has nothing to do with parcels, and this ADR doesn't extend sharing to them.
- A future "share the whole producer account" need (0001's original consultant scenario) is still open and unaffected -- this ADR solves the narrower, differently-shaped problem that was actually asked for; it doesn't replace `0001`'s own planned fallback if that broader need ever shows up for real.
- Revoking a share (deleting the `parcel_shares` row) takes effect immediately and cleanly -- there's no cached/derived state anywhere that would keep stale access alive past that.
- **A real gap sat in this design's own cascade for a full release cycle, found only while building the first real UI for it:** this Decision's text says `plots.parcel_id` and `planting.parcel_id` get `select` policies rewritten to `user_can_access_parcel(parcel_id)` -- true, and done -- but `parcels`' *own* `select` policy was never touched, left calling `user_can_access_producer(producer_id)` directly, a function with no idea `parcel_shares` exists at all. A share recipient could therefore see a shared parcel's plots, rows, and plantings, but never the parcel row those things actually belong to -- confirmed directly by reading `user_can_access_producer`'s own definition, not assumed, then verified empirically (a scratch-created recipient with a real `viewer` share got zero rows back from `parcels`; an unrelated producer with no share also correctly got zero, confirming the fix didn't loosen anything else). Fixed by giving `parcels` the same `user_can_access_parcel(id)` policy every other table in this cascade already had.
- **No UI existed for any of this until the same pass that found the bug above.** `shared_with_producer_id` is a raw uuid nobody has any way to know, and `producers`/`profiles`' own RLS deliberately blocks a client from resolving one producer to another's name or email directly -- so two narrow `SECURITY DEFINER` functions, `share_parcel(parcel_id, recipient_email, role)` and `get_parcel_shares(parcel_id)`, do that resolution the same way `add_data_source`/`create_producer_and_profile` already established for "one specific privileged action needs elevated access." `get_parcel_shares` still honors this ADR's own privacy rule -- an owner sees every share on their parcel, a recipient sees only their own row, never who else has access. A real, if minor, tradeoff named directly: resolving by email means a mistyped address reveals whether *an account* exists for it, accepted here since this project makes no broader promise of email privacy and the alternative (failing silently) is worse for the one real use this serves. The UI itself lives in `ProducerDataTree.tsx` -- a "Share" control next to a parcel you own, a read-only "Shared by X · role" badge on one shared to you.
