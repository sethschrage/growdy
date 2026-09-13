# 0014. An observation can stand on its own, without a planting

**Status:** proposed

## Context

Every observation today (`0005`) must reference a specific `planting_id`
-- it's a dated note about one identified plant at one plot, row, and
position. That matched everything the chat's submission flow (`0009`)
was originally built to capture: "the plant near the busted trellis has
fungus" is about one plant, so requiring a resolved planting made sense.

Real use surfaced something that shape can't hold. Not everything worth
logging is about a single plant: "I trimmed the weeds," "sprayed the
whole vineyard," a general task done or something noticed that isn't
tied to one position at all. Today the chat's `submit_observation_draft`
tool requires plot, row_number, and position before it will even draft a
submission -- so there's no way to log any of this. The model just keeps
asking for a position that was never going to exist, exactly the
"identifying detail they do have" loop `0009`'s system prompt describes,
except here there's no detail of that kind to give.

## Decision

`planting_id` becomes nullable on `observations`. An observation now only
needs a `producer_id` and a `note` -- the link to a specific planting is
there when there is one, not forced when there isn't.

In the chat, `submit_observation_draft` no longer requires plot,
row_number, or position -- only `note` is required. The system prompt
still asks for plot/row/position when someone's clearly describing a
specific plant, and the existing match-and-confirm flow against
`planting_readable` is completely unchanged for that case. When someone's
describing something general instead, the model drafts the submission
with just the note, and the client inserts it with `planting_id` left
null rather than resolving (or asking for) a location that was never
part of what was said.

Deliberately not adding a `parcel_id` or any other structured location
field yet, even though a parcel is often knowable. Guessing at what
structure an unattached note needs, before any real ones exist to look
at, is exactly the mistake `0008` exists to avoid -- the same reason
`plant_types` waited for a real import (`0004`) instead of being designed
ahead of one. Real unattached observations will show whether producers
naturally mention a parcel or area often enough, and consistently enough,
to be worth capturing as a field rather than left in free text.

## Consequences

- A producer can log anything worth remembering about their vineyard
  through the same chat, without the app forcing a plot/row/position
  onto something that was never about one plant.
- Review still works exactly as `0009` describes -- an unattached
  observation lands as `pending` and gets approved or rejected the same
  way, just with nothing to cross-reference the note against but itself.
  Whether that turns out to be enough for a reviewer to act on is exactly
  the evidence that would justify adding structure later.
- Anything that lists a planting's observations already joins through
  `planting_id` and needs no change. A view that lists *every*
  observation, attached or not, is new and out of scope for this pass --
  nothing currently needs one.
