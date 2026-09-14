# 0015. Lookup counts are computed in SQL, not by counting fetched rows

**Status:** accepted

## Context

`0013` completed the tool-use round trip so the model could compose a
real answer over real data, but the client still had to resolve that
data itself first. For `variety_lookup` and `parcel_lookup`, "resolve"
meant fetching every matching row from `planting_readable` and counting
the array in JavaScript -- `total_matches: matches.length`, grouped
breakdowns built by hand over that same array.

That works right up until a search matches more rows than PostgREST
returns in one response. The default cap is 1,000 rows; it applies to
however many rows a plain `select` actually returns, with no error and
no warning. A real question -- "how much Gamay do I have" -- hit this
exactly: 2,004 rows actually match, PostgREST handed back 1,000 of them,
and the client faithfully reported a total of roughly 1,000, split
oddly across plots depending on whichever 1,000 happened to come back.
The model answered correctly from the data it was given; the data itself
was already wrong before the model ever saw it.

## Decision

Two Postgres functions, `variety_lookup_counts(search)` and
`parcel_lookup_counts(target_parcel)`, do the counting with `GROUP BY`
in SQL and return only the aggregated rows -- one row per parcel/plot
combination, never one row per planting. `security invoker` so they
still run under the caller's own RLS-scoped session, same as
`planting_readable` itself.

The client calls one of these first to get `total_matches` and the
by-parcel/by-plot breakdowns, both computed server-side and immune to a
response-size cap that only ever applied to raw rows. Only when that
total is small enough to actually show a detailed list (`<=
MAX_DETAILED_MATCHES`, unchanged from `0013`) does the client still
fetch the individual matching rows -- bounded, by construction, to a
number of rows that could never approach the cap.

## Consequences

- A variety or parcel search reports its true count and breakdown
  regardless of how many plantings actually match -- 2, 2,000, or
  20,000 make no difference to correctness, only to whether a detailed
  list is worth showing.
- Two more functions to review and RLS-reason about, doing exactly the
  same job the client used to do with a `.select()` and a hand-rolled
  count -- the query didn't get more complex, just moved to the side
  that can't be capped out from under it.
- `planting_lookup` and `position_status` were never at risk -- both are
  already scoped to one specific plot/row (or row), never more rows than
  fit in a single position or row's worth of positions -- so this only
  touches the two lookup types that search across an unbounded number of
  plantings.
