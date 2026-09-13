# 0005. Observations: append-only, free text now, structure later

**Status:** accepted

## Context

The original project notes called for an append-only observation log,
linked to a planting rather than a bare position, using structured fields
for anything that might eventually drive an alert rather than only free
text. Real import data (196 dated field notes from an actual vineyard)
gave a concrete test case for what this actually needs to hold.

## Decision

`observations`: `planting_id` (required), `producer_id` (denormalized),
`observed_date` (nullable), `note` (required text), `photo_metadata`
(nullable text), `created_at`.

**Append-only by discipline, not by schema enforcement.** No trigger or
constraint blocks an `UPDATE`/`DELETE` -- corrections are expected to
always insert a new row instead, matching the same discipline `planting`
already uses for replacing a plant. No "supersedes" link to a prior
observation exists yet; nothing has needed one so far.

**`note` stays free text**, even though real data included recurring
patterns (e.g. "Potentially Low" appearing 29 times) that look like
plausible candidates for a real structured field later. Deciding that now
would be guessing ahead of an actual need -- the same discipline used
throughout this schema (e.g. PostGIS wasn't enabled until an unplotted
planting actually required it). If a pattern turns out to matter for
querying or alerting, promoting it to a real column is a small, later
migration -- the raw text isn't lost in the meantime.

**`observed_date` is nullable**, deliberately, and distinct from
`created_at`: `observed_date` is when the observation happened in the
field (often long before the row is written), `created_at` is pure
bookkeeping. Nullable rather than forcing a guessed value, so "genuinely
unknown" can be represented honestly instead of silently defaulting to a
fabricated date.

**`photo_metadata` preserves raw EXIF/XMP text**, unparsed, for an
observation that came with a photo. A real example surfaced GPS
coordinates, altitude, capture timestamp, and a description embedded in a
photo's metadata -- richer and more reliable than a guessed date. Rather
than designing a full photo/image feature (Supabase Storage upload, a
proper `location` point, a dedicated capture-date column) speculatively,
the raw text is kept as-is now, to be mined for real structured columns
once that feature actually gets built.

## Consequences

- Any future "which observations look like they should be real fields"
  decision (e.g. a vigor/health status) is a normal additive migration on
  already-imported data, not something blocked by this table's shape.
- A full photo/image feature (file storage, spatial columns, structured
  capture metadata) is still undesigned. `photo_metadata` is a deliberate
  placeholder for that future work, not a substitute for it.
