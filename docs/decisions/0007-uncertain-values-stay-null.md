# 0007. Uncertain identity: null the field, don't store the guess

**Status:** accepted

## Context

The original bulk import included a real case of genuine uncertainty: a
row of grafted vines where it wasn't known for sure whether individual
plants were Franc214 or Franc312 (the grower's own words: "not sure if
they were reversed"). The initial approach stored the best guess directly
in `scion_variety_id` (positions 1-50 as Franc214, 51-100 as Franc312),
with an observation noting the uncertainty in text.

A later import round hit the same shape of problem again -- replanted
vines with a hedged rootstock ("hopefully 101-14", "Gamay 33 hopefully").
Asked directly whether to keep guessing-into-the-FK-with-a-caveat-elsewhere,
or leave the field null, the answer was null -- and the original
Franc214/312 guess was corrected retroactively to match.

## Decision

**When a plant identity fact (`variety_id`, `scion_variety_id`,
`rootstock_variety_id`) is hedged or uncertain, the column stays null.**
The guess itself, if worth keeping, goes in `nickname` (free text, no
confidence implied) and/or an `observations` note -- never asserted as
fact in the structured, queryable column.

Reasoning: a non-null value in a foreign key column reads as a confirmed
fact to anyone querying it directly -- `where scion_variety_id = X`
doesn't distinguish "we know this" from "we guessed this." Storing a
guess there creates a false sense of certainty that only a caveat buried
in a separate table's text can correct, and most queries will never go
looking for that caveat.

## Consequences

- This costs some queryability: "show me everything on rootstock X"
  won't surface a plant that's *probably* on rootstock X but wasn't
  confirmed. That's the deliberate tradeoff -- a non-null value must
  always mean confirmed, not "likely."
- `nickname` is held to a different, looser standard than the FK columns:
  it can carry an informal, unconfirmed label (e.g. `"Gamay"` with no
  clone number, when the number itself is what's uncertain) without
  implying the same confidence a populated `scion_variety_id` would.
- Every future import needs to make this distinction explicitly for each
  fact: confirmed, or hedged? Only confirmed facts populate the FK
  columns; hedged ones stay null with the guess preserved as text
  elsewhere.
- The original South-11 Franc214/312 split was corrected to match this
  (both `scion_variety_id` values nulled, `rootstock_variety_id` left as
  the confirmed `3309 Couderc`) -- a data fix applied directly, not a
  schema migration, since no column changed shape.
