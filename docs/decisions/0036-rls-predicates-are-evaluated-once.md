# 0036. A tenancy check runs once per statement, not once per row

**Status:** accepted

## Context

A producer asked the chat what the weather was. It took eight model
turns, about thirty-five seconds and 146,681 displayed tokens, and the
logs show why: the first query it wrote --- a join of
`weather_observations` and `data_sources`, ordered by time, limited to
five rows --- died on `execute_readonly_query`'s five-second statement
timeout. The model then spent seven turns working around a failure it
could not see the cause of, including `SELECT id FROM data_sources`, a
`GROUP BY` over every source, and `SELECT now()`.

That query is not slow. Measured with RLS out of the way it runs in
**77 ms** over 143,588 rows. What made it time out was the tenancy
check, and the shape of that check is the thing worth recording, because
it looks entirely reasonable:

```sql
using (private.user_can_access_producer(producer_id))
```

The argument is the row's own column, so the function runs once per row.
It is `SECURITY DEFINER` with a `SET search_path`, which makes it
ineligible for inlining, so each call is a real function call with its
own subplan. Measured on that table, evaluating the predicate alone:

| | |
|---|---|
| `private.user_can_access_producer(producer_id)` | **1,500 ms** |
| `producer_id = (select private.current_producer_id())` | **15 ms** |

A hundred times, and the second form becomes an index condition rather
than a filter. Nothing flagged this. `supabase db lint` is plpgsql_check.
Supabase's own performance advisor has an `auth_rls_initplan` lint, and
it did not fire, because the per-row work is hidden behind a helper
rather than being a bare `auth.uid()`. The cost is also invisible until a
table gets big: the identical policy on `data_sources`, which has four
rows, is free.

## Decision

**Every tenancy policy compares against a value resolved once.**
`private.current_producer_id()` takes no arguments, so Postgres evaluates
it as an InitPlan and the per-row work is a uuid comparison. Thirty
policies across fourteen tables are rewritten; the ones reached through
the parcel hierarchy use `IN (subquery)`, which builds its set once.

**The rewrite is provably the same test**, which is why it is safe to do
in one migration. `private.user_can_access_producer(X)` is
`exists (select 1 from profiles where id = auth.uid() and producer_id =
X)`. `profiles.id` is the primary key, so a caller has at most one
profile row, and that `exists` is true exactly when `X` equals that row's
`producer_id`. With no profile row the subquery yields null, `X = null`
is null, and the row is filtered --- the same answer.

**The helper functions stay.** `confirm_observation_candidate()` and
`get_decrypted_source_secret()` call them once per statement, on a single
row, which is the shape a function call is right for.

**`private.user_can_edit_parcel` is dropped, not rewritten.** It queries
`public.parcel_shares`, which [`0028`](0028-what-uat-removed.md) removed,
so the `plot_rows` update policy it backed has been failing with
"relation parcel_shares does not exist" ever since --- a policy no writer
could satisfy, found only by reading every policy for this change. With
sharing gone, "editor or owner" is just owner.

**A check keeps the shape.** `scripts/check-rls-shape.mjs` fails any
policy that calls one of the per-row helpers, or a bare `auth.uid()`,
against the database CI builds from the migrations
([`0035`](0035-what-the-docs-are-checked-against.md)'s rule: a claim is
checkable when something can contradict it without judgement).

## Alternatives

**Raise the statement timeout.** Treats the symptom, and the wrong way
round: five seconds is already generous for a question a producer is
waiting on, and a timeout is how the model learns the query was bad.

**Add an index.** The index it would want already exists ---
`(source_id, observed_at)`. The predicate was the cost, not the scan.

**Leave it and denormalise harder.** Every table already carries a
redundant `producer_id` for exactly this reason
([`0001`](0001-tenancy-membership-model.md)). The columns were there; the
policies were not using them in a form Postgres could hoist.

**Let the chat's reads bypass RLS.** The one option that would have been
faster still, and the one that trades the property this schema is built
on --- every query the model writes is scoped to the caller by the
database, not by the prompt --- for latency. Not a trade worth making
for any speed.

## Consequences

- **A weather question should now answer in one or two turns.** The
  eight-turn loop was a response to a failure, not to the question.
- **Thirty policies changed in one migration**, which is a large security
  diff. The equivalence argument above is what makes it reviewable: every
  rewrite is the same predicate with the caller resolved earlier.
- **One write path starts working again.** Updating a `plot_row` --- its
  length, spacing, end-post count --- has been impossible since `0028`
  and nobody noticed, because nothing in the app does it often and the
  failure is a policy error rather than a crash.
- **The next policy is checked.** Writing a new one the old way fails CI,
  which matters because the old way is the obvious way and reads better.
