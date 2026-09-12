# 0001. Tenancy membership model: simple, behind an indirection

**Status:** accepted

## Context

`producer` is the permission boundary: RLS scopes every table by
`producer_id`. That still leaves one question -- how does a *user* resolve
to a producer? Two shapes were considered:

- **Simple:** `profiles.producer_id` -- one producer per user.
- **Join table:** `user_producers` -- a user can belong to multiple
  producers (e.g. a consultant working across several operations).

There's no known multi-producer user today.

## Decision

Use the simple shape, but never let any RLS policy check `producer_id` (or
a join table) directly. Every policy instead calls one function,
`private.user_can_access_producer(producer_id)`. That function is the only
place the membership model is implemented.

If a real multi-producer requirement shows up later: create
`user_producers`, backfill one row per existing profile, and rewrite the
body of that one function. No other table or policy changes.

## Consequences

- Choosing "simple" up front carries no real lock-in risk, because the
  membership model is isolated behind one function rather than inlined
  into N RLS policies.
- The helper function lives in a `private` schema (not `public`), so it's
  reachable from RLS policy evaluation but not callable directly as a
  PostgREST RPC endpoint -- caught by the security advisor during review
  and fixed before merge.
