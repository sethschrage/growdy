# 0018. plant_types.common_name, so a clone code resolves to its variety

**Status:** proposed

## Context

`plant_types.name` for a `kind = 'scion'` row is often a formal certified
clone identifier (e.g. "ENTAV-INRA® 358"), not the grape variety a producer
would actually ask about. This producer's real scion rows are exactly
that: four ENTAV-INRA clone codes, and zero rows with `kind = 'variety'`
at all. A question like "how much Gamay do I have" has no column to match
against -- `variety`/`scion` in `planting_readable` would only ever
surface the clone code. PR #78 already found this exact question
resolving only through `nickname`'s free text, by luck, not because the
schema actually connects the clone to the variety it is.

## Decision

Added `plant_types.common_name` (nullable text): the grape variety a row
is actually known as, distinct from `name` (which may be a formal clone
identifier) and from `planting.nickname` (a per-planting, non-shared,
informal label -- see [0004](0004-plant-types-kind-and-planting-columns.md)).
Scoped to scion rows for now, per real evidence: rootstocks are
conventionally referred to by their formal identifier already (e.g.
"3309"), and a `kind = 'variety'` row's `name` is already typically the
common name itself -- there's no current row where either needs a second
name.

Backfilled this producer's four real scion rows against the official
ENTAV-INRA clone registry (selections.entav-inra.fr), not guessed: 214
and 312 are both Cabernet Franc clones (two different certified
selections of the same variety is normal, not a mistake), 358 is Gamay,
817 is Meunier.

`planting_readable.scion` now resolves to `coalesce(common_name, name)`,
so the common name surfaces automatically through the view the chat is
already told to prefer -- no separate lookup or chat-side logic needed.
`variety` and `rootstock` are unchanged, per the same scoping.

**Promoting a `kind = 'scion'` row from `pending` to `canonical`**
([0003](0003-plant-types-reference-table.md)'s review step) **now
includes setting `common_name`**, not just accepting the proposed
`name`. That promotion is already a manual, human-reviewed action with
no self-service path -- the natural, and only, moment to research and
capture the variety a new clone code actually is, rather than a gap
left for whoever next asks the chat a question that clone should have
answered. A `common_name` that turns out wrong or incomplete gets
corrected the same way a canonical `name` would -- an `UPDATE`, reviewed
like any other change to real data -- not treated as fixed at
promotion time.

## Consequences

- A future `kind = 'variety'` row, or a rootstock referred to informally
  enough to need its own common name, can populate `common_name` the same
  way -- the column isn't scion-specific by constraint, only by current
  data.
- This doesn't touch `nickname` at all -- it closes a different gap than
  that solves. It does extend 0003's review step with one more thing to
  check before promoting a scion proposal, the same review discipline
  already generalized in `CONTRIBUTING.md`'s Migrations section (every
  migration that adds a table or column includes its own `COMMENT ON`,
  for the same reason: capture context when the thing is created, not
  after someone's already had to work around not having it).
