# 0013. The model composes the answer to a describe_query, not a client template

**Status:** proposed

## Context

`0010` split answering a question into two halves: the model extracts
which known query is being asked (`describe_query`), and the client
resolves and executes it. What that ADR didn't specify -- because there
was nothing to say yet -- is what happens to the *result* of that
resolution. In practice, the client formatted it itself: a handful of
hardcoded string templates (`describePlanting`, a position-status
sentence, a parcel-count breakdown for large variety matches) turned
resolved rows into the text a producer actually read.

That worked while questions stayed narrow, but it stopped scaling once
`0010`'s own scope grew past its original single-planting/status-only
design (`#53`, `#56`, `#64`): a real question like "how much Gamay do I
have" needs a different answer than "where is my Gamay," even though
both resolve the same rows, and neither should read the same way as "what
kind of Gamay do I have." A fixed template can't tell those apart --
every answer to a given query type comes out shaped exactly the same way
no matter how the question was phrased, because the template is the only
thing that ever sees the resolved data. The model, which is the only part
of this system actually reading the question's phrasing, never saw the
data at all.

## Decision

Complete the tool-use round trip that was already half-built. The client
still does 100% of the data resolution -- same views, same RLS, no
generated query, `0010`'s actual safety property untouched -- but instead
of formatting the result into prose itself, it sends the resolved data
back to the same Edge Function conversation as an Anthropic `tool_result`
(the model's original `tool_use` turn, paired with a new turn carrying
the aggregated data as JSON), and uses the model's own resulting text as
the answer.

The Edge Function's part of this is minimal: the response when a tool
fires now also carries `tool_use_id` and `assistant_content` (the raw
content block array from Anthropic) alongside the existing extracted
fields, so the client has what it needs to construct a valid follow-up
call. Nothing else about the function changes -- it already accepts an
arbitrary `messages` array and already returns plain text once no further
tool call is made; the round trip is just a second ordinary call to the
same endpoint.

For queries that could resolve to a large number of rows (a variety
search can match thousands), the client still aggregates before sending
data back -- parcel and plot breakdowns, plus the individual rows only
below a cap -- rather than shipping every matched row to the model. That
cap is a payload-size decision, not a trust boundary: it bounds how much
raw data goes in a single round trip, not what the model is allowed to
ask the database for, since the model never asks the database anything.

This round trip is scoped to `describe_query` only. `submit_observation_draft`
keeps its existing client-side confirm-before-write step untouched --
composing a better answer to a question and safely handling a write are
different problems, and only one of them was actually broken.

## Consequences

- A producer's answer now genuinely reflects how they asked -- "how
  much," "where," "what kind" -- because the model is composing it from
  real data instead of picking between a fixed set of pre-written shapes.
- The stored, browsable transcript (`0011`) doesn't grow the round trip's
  scaffolding turns -- the tool_use/tool_result pair exists only for the
  single follow-up call that produces the visible answer, never written
  to `conversations` or shown as a chat bubble.
- Every future `describe_query` type benefits automatically: adding one
  still means a new query type and a client-side resolver (`0010`'s
  standing pattern), but no longer also means writing and maintaining a
  new prose template for it.
