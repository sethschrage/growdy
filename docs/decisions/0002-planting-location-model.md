# 0002. Planting location model: organized vs. unplotted

**Status:** accepted

## Context

Not every plant is deliberately placed in a gridded plot/row/position.
Weeds, invasives, and wild trees found somewhere on a parcel need to be
tracked too, with no plot/row/position to describe them -- only a
coordinate.

An earlier draft allowed a graduated hierarchy (parcel only; parcel+plot;
parcel+plot+row; fully specified) so that partial data could be entered
incrementally. In practice, organized plantings are always placed
deliberately as a complete unit -- there's no real scenario where "we know
the plot but not the row" happens on its own.

## Decision

A planting is in exactly one of two states, enforced by a check
constraint:

- **Organized**: `plot_id`, `plot_row_id`, and `position` are all set
  together.
- **Unplotted**: none of those three are set, and `location` (a PostGIS
  point) is required instead.

`location` may optionally be set on an organized planting too (e.g. for
later comparison against aerial imagery extents), but is only *required*
in the unplotted case.

This is also why PostGIS was enabled at this point in the project, not
earlier: it was deferred until an actual need existed (an unplotted
planting has no other way to be located), rather than enabled speculatively
ahead of that need.

A partial unique index (`plot_row_id, position where removed_date is
null`) enforces at most one *active* occupant per position, which also
enforces the "close the old planting before opening a new one" workflow
at the database level, not just by convention.

## Consequences

- Simpler than a graduated hierarchy: exactly two valid shapes, not four,
  matching how the data is actually produced.
- A planting's location is always resolvable one of two ways: through its
  plot/row/position, or through a direct coordinate -- never neither.
- `producer_id` is a plain FK on `planting` (and on `plots`/`plot_rows`),
  not enforced to match its parent's `producer_id` via a composite FK.
  Left as a trusted invariant while the schema is still moving quickly.
