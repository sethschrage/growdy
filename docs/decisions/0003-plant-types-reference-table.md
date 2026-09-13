# 0003. Plant type vocabulary: propose-then-review entries, schema stays fixed

**Status:** superseded by 0004

## Context

A real spreadsheet of an actual vineyard's tracking data revealed a gap:
grafted plants have a **scion** (fruiting variety) and a **rootstock**
(root variety) -- two distinct identities `planting.species` (a single
free-text column) can't represent. This led to designing a shared,
global `plant_types` reference table (e.g. "Cabernet Sauvignon", "3309C",
"Japanese knotweed"), so `species`, `scion`, and `rootstock` become
pre-selectable FK references into one vocabulary instead of freely typed
text.

That raised a question this ADR exists to settle precisely, because an
early pass at it conflated two different things under the word "fields":

- **Schema structure** (columns, tables, types) -- e.g. adding a
  `scion_variety_id` column to `planting`, or a new table entirely.
- **Entries** (rows/values within an existing structure) -- e.g. a new
  row in `plant_types` for a variety that doesn't exist in the list yet.

## Decision

**Schema structure is never producer-controlled.** New columns, tables, or
types are only ever added by us, via a normal reviewed migration -- same
as everything else in this project. This can happen at any time, including
as part of a future data import (see Consequences); it never involves
producer-facing tooling.

**Entries within `plant_types` can be producer-proposed**, because a
producer needs to record what's actually planted today even when the
exact variety isn't catalogued yet (a new rootstock, an unidentified
weed). The mechanism:

- `plant_types.status`: `pending` / `canonical` / `rejected`, restricted
  via a `check` constraint (unlike open-ended free-text vocabularies
  elsewhere in this schema -- e.g. `planting.category` -- `status` is a
  small, closed, RLS-relevant workflow state, not a growing descriptive
  tag, so it's constrained rather than left loose).
- `plant_types.proposed_by_producer_id`: nullable FK to `producers`. Null
  only for pre-seeded canonical rows never proposed by anyone; required
  for any `pending`/`rejected` row.
- RLS (one combined `select` policy): `canonical` rows are visible to
  every authenticated producer; `pending`/`rejected` rows are visible only
  to the producer who proposed them. A rejected proposal stays visible to
  its proposer (so they can see it was declined) but never becomes
  globally visible.
- Promotion (`pending` -> `canonical`) and rejection (`pending` ->
  `rejected`) are both plain `UPDATE`s, reviewed through this project's
  existing PR-based process -- no automated or self-service promotion
  exists yet; that's explicit future work once a producer-facing UI
  exists at all.
- No uniqueness constraint on `name`: normalization (case, whitespace) is
  an unresolved product question, and a unique index would leak the
  existence of another producer's hidden pending row via a
  constraint-violation error on insert -- exactly the cross-producer
  visibility this design is meant to prevent. Left as a human-reviewed
  invariant, same category as the unvalidated `producer_id` FK elsewhere
  in this schema.
- No insert/update/delete RLS policies exist on `plant_types` yet, since
  there's no front-end -- all writes (including today's placeholder for
  "producer proposes an entry") happen via direct SQL/service_role, same
  as every other table in this project today.

## Consequences

- **Not yet implemented.** No `plant_types` table exists, and `planting`
  still has its original free-text `species` column. This is deliberate:
  schema changes (including exactly which columns `planting` needs --
  `species_id`, `scion_variety_id`, `rootstock_variety_id`, and whether
  scion/rootstock need a pairing constraint) get finalized when we
  actually do a real data import, not guessed at ahead of time. "We can
  always add fields on import" -- the import itself is normal, reviewed
  dev work, and is the natural moment to settle field-level questions
  real data will make obvious.
- When implemented, `private.user_can_access_producer()` is reused
  unmodified: passed a null `proposed_by_producer_id` (the pre-seeded-
  canonical case), it safely returns `false` for every caller (SQL
  three-valued NULL-comparison semantics), so no variant of the helper
  function is needed.
- Duplicate canonical entries (two spellings of the same cultivar) are
  possible and caught by human review at acceptance time, not a database
  constraint -- revisit if that becomes inadequate.
