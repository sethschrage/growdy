# 0009. Observation submission is a chat, not a form -- on purpose

**Status:** accepted

## Context

The app needs a way for producers and field workers to submit observations.
Two shapes were considered: a structured form (pick a planting, write a
note, optional date), or an open-ended chat where someone describes
whatever they want in their own words and gets asked for anything
missing.

Per `docs/decisions/0008`, the app's job isn't just to collect data
efficiently -- it's to find out where the schema's assumptions break
against real, unstructured field language, the same way raw import data
(spreadsheets, terse field notes, photos) already surfaced real gaps
(`plant_types.kind`, dead vs. removed, uncertain values staying null). A
structured form would hide those gaps by forcing every input into a shape
that already fits the schema. Chat won't -- someone describing a plant as
"the one near the busted trellis" is exactly the kind of input worth
seeing.

## Decision

Observation submission happens through a chat interface. A Supabase Edge
Function holds the Claude API key -- the one server-side piece in an
otherwise client-only app -- and is the only thing that calls the LLM;
the app's own chat UI stays thin, sending messages and rendering replies,
no logic of its own.

Every conversation resolves to exactly one `observations` row with
`status = 'pending'`. The AI's only job during the conversation is
identifying two things: which planting this concerns, and what the note
says. If a planting can't be confidently resolved from the description,
the AI doesn't guess -- same principle as `0007` (uncertain values stay
null) -- it either asks a clarifying question, or, if the person
genuinely doesn't know, leaves the submission flagged as unresolved for
manual review rather than picking a probable match.

The raw conversation transcript is stored alongside the resolved fields,
not discarded, for two reasons. First, review needs to judge whether the
AI's interpretation was actually correct, not just whether the resulting
note reads sensibly -- that requires seeing what was actually said.
Second, and more fundamentally: reviewing real transcripts over time is
how the schema keeps getting tuned against real usage. Every submission
is a data point about how someone actually describes a planting, an
event, an ambiguity -- the same kind of evidence the original imports
provided (which is what revealed the need for `plant_types.kind`, or the
dead/removed distinction). Discarding the transcript after resolving it
into an `observations` row would throw away exactly the information that
teaches us what the schema still doesn't account for.

Photo attachment is deliberately deferred to a later iteration. Text-only
first, to prove the conversation/resolution/review loop before adding
upload handling and multimodal parsing on top of it.

## Consequences

- Every submission needs human review before becoming confirmed data --
  the same review discipline this project has followed for every import
  all along, just moved into the app instead of a chat with Claude
  directly.
- Surfacing real schema gaps and awkward phrasing is the intended
  outcome here, not a bug -- per `0008`'s evidence-driven approach to
  building the app.
- Manual review of every submission is doing double duty: it's quality
  control before data counts as confirmed, and it's the mechanism for
  learning what real use cases and phrasing patterns actually look like
  -- knowledge that should keep tuning the schema over time, not just
  get read once and forgotten.
- A review process needs access to both the transcript and the resolved
  fields; showing only the final note would lose the ability to judge
  whether the AI got it right.
- An unresolved-planting submission needs real handling during review
  (deciding what planting it actually was, or discarding it) -- not
  solved by this ADR, left as a concrete next question once real
  unresolved cases exist.
- This is the project's first server-side component holding a secret
  (the Claude API key, in Edge Function config). Everything before this
  has been either pure schema or a thin client using public,
  client-safe keys.
