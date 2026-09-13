# 0006. Planting lifecycle: dead vs. removed, and position status as a view

**Status:** accepted

## Context

A real import case ("Dead" on a specific planting) was initially handled by
setting `removed_date` directly -- conflating two different events. A plant
can die while still physically in the ground; being cleared out is a
separate, later (or sometimes simultaneous) event. That distinction
matters structurally: `removed_date` is what determines whether a new
planting can occupy the same position (the partial unique index on
`(plot_row_id, position) where removed_date is null`), so it needs to mean
specifically "physically cleared," not "no longer alive."

Separately, a real need emerged for a per-position status (planted /
blocked / open) to know which spots need attention.

## Decision

**Three-moment lifecycle**, not two: `planted_date` -> optional
`dead_date` -> optional `removed_date`. `dead_date` is approximate (we
rarely know the exact moment), not a precise timestamp. A dead-but-not-
removed planting still counts as occupying its position -- `removed_date`
alone gates whether a new planting can be recorded there.

`removed_reason` is free text (matching `category`'s precedent, not
`status`/`kind`'s check-constrained precedent) -- removal causes are an
open, growing vocabulary (dead, damaged, replaced, ...), not a small
closed set anything branches on structurally.

**Position status is a SQL view, not a stored column.** For each
`(plot_row_id, position)` that has at least one `planting` record, take
the single latest one (by `planted_date`, tie-broken by `created_at`) and
derive:

```
case
  when removed_date is not null then 'open'
  when dead_date is not null   then 'blocked'
  else 'planted'
end
```

Checked in that order: a removed planting is `open` regardless of
`dead_date` (cleared is cleared, whether death preceded it or not); a
dead-not-removed planting is `blocked`; otherwise `planted`.

A position with literally zero `planting` records ever doesn't appear in
the view at all -- there's no stored "this row has N valid positions"
fact to check against, so "never planted" is represented by absence, the
same pattern used elsewhere in this schema (e.g. how an empty position
already meant "no active planting row" before this ADR).

**Gap detection was explicitly considered and rejected for now**: whether
a numbering gap within a row (position 4 and 6 exist, 5 doesn't) should
count as "open" would require an authoritative "this row has N positions"
fact that doesn't exist in the schema. Inferring it from whatever's
currently planted would be guessing at a fact we don't actually have.
Deferred until row length/position count become real, declared data (see
Consequences) rather than solved by assumption now.

## Consequences

- N11-65 (the "Dead" example that started this) needs a data correction:
  move its `removed_date` to `dead_date`, clear `removed_date` back to
  null -- it's still occupying that position until an actual removal date
  is known.
- The view depends on this migration's new columns existing, so it lands
  as its own follow-up PR/migration, not bundled here.
- This also motivated adding real physical attributes to `plot_rows`
  (length, position spacing) in a separate migration -- once a row
  declares its own length, gap detection above stops being a guess and
  becomes a real, decidable question. Not solved in this ADR; noted as
  the natural next step it unlocked.
