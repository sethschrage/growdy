# 0004. plant_types kind, and how planting references it

**Status:** accepted (supersedes 0003)

## Context

0003 settled the propose-then-review shape of `plant_types` but was written
before any real data forced the remaining questions: what column(s) on
`planting` actually reference it, and whether `plant_types` needs any
internal structure beyond a bare `name`. Working through an actual import
(a real vineyard's planting records and a separate grafted-vine variety
table) surfaced all of this concretely.

## Decision

**`plant_types.kind`**: a `variety`/`scion`/`rootstock` classification,
check-constrained (unlike open-ended vocabularies elsewhere in this schema
-- e.g. `planting.category` -- which stay free text on purpose). A
rootstock cultivar is never usable as a scion; `kind` is a small, closed,
structurally-relevant distinction that a future picker would filter on,
not a growing descriptive tag, so it gets the same treatment as `status`
(check-constrained) rather than the same treatment as `category` (free
text).

**On `planting`**, four nullable columns, used in two mutually exclusive
patterns depending on whether a plant is grafted:

- `variety_id` -- FK to `plant_types` (`kind = 'variety'`). Used alone,
  for an own-rooted plant (renamed from 0003's `species_id`: "variety" is
  the accurate viticulture term -- most wine grapes are the same species,
  `Vitis vinifera`, just different varieties).
- `scion_variety_id` / `rootstock_variety_id` -- FK to `plant_types`
  (`kind = 'scion'` / `'rootstock'` respectively). Used together, for a
  grafted plant.
- `nickname` -- free text, per-planting (not shared/deduplicated the way
  `plant_types` entries are). A producer's own informal label for a
  specific graft combination (renamed from an earlier working name,
  `cepage_nickname` -- "cépage" is French wine terminology and doesn't
  generalize to a grafted apple or citrus tree, even though grafting
  itself isn't grape-specific).

No pairing constraint between `scion_variety_id` and `rootstock_variety_id`
(considered and rejected): real data included a case where the same
producer wasn't certain which of two clones was actually planted where,
and forcing both-or-neither would have blocked recording a partially-known
graft.

No `grafted`/`own-rooted`/`hybrid` classification is stored anywhere. It's
fully derivable from which of `variety_id` vs. `scion_variety_id`/
`rootstock_variety_id` is populated -- storing it separately would just be
a second copy of the same fact, with a real chance of drifting out of
sync. It's computed at query/report time instead.

## Consequences

- `plant_types` rows are genuinely reused across many plantings (e.g. two
  different grafted varieties sharing the same scion clone but different
  rootstocks each reference the same `plant_types` scion row) -- this is
  the actual payoff of the lookup table over free text, confirmed against
  real data rather than assumed.
- A `nickname` is expected to repeat across many plantings that happen to
  share the same graft combination (planted from the same nursery batch).
  That repetition is a normal data pattern, not something the schema
  tries to prevent or deduplicate into its own entity -- `nickname` lives
  directly on `planting`, denormalized, not through a shared
  "graft combination" table.
- This ADR's decisions are implemented by the migration in this same PR.
  0003's propose-then-review workflow for `plant_types` itself is
  unchanged and still governs how new entries get added.
