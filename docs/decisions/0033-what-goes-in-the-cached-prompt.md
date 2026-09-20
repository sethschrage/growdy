# 0033. What goes in the cached prompt, and what must never

**Status:** accepted

## Context

Every pass of the chat's tool loop re-sends the whole prompt. The
Messages API is stateless, so a question needing one database query
pays for the instructions, the seven tool definitions and the
description of twelve relations twice; a five-tool answer pays six
times.

Measured on the live function, that block is **15,240 tokens**. It is
also the least interesting part of any request -- it is identical from
one turn to the next, and mostly identical from one producer to the
next.

Anthropic's prompt caching charges a cached read at roughly a tenth of
the input rate, and a write at 1.25x. The catch is that the cache is
content-addressed: it matches an exact prefix, byte for byte. That
makes the interesting question not "should we cache" but "what is
allowed to be in the cached part", because the failure mode is silent
and costs *more* than not caching -- every request paying the write
premium and never reading anything back.

## Decision

**Two cache breakpoints, split by how fast each half changes.**

The first block holds the instructions, the tool definitions and the
schema description. It is the same text for every producer and changes
only when a migration changes the schema or someone edits the prompt.
It is the expensive one, and being identical for everyone means a
single entry serves all of them.

The second holds what this producer has switched on under Knowledge
Categories. That changes whenever they enable or disable a source,
which is a thing they are supposed to do freely. Prefixes are
cumulative, so a change there leaves the first block's entry intact:
toggling a weather source rewrites a few hundred tokens instead of
throwing away fifteen thousand.

Mixing the two -- which is how the prompt was assembled before this --
would have tied the expensive text to a per-producer setting, and made
it impossible for two producers to ever share an entry.

**Nothing that varies per request may go in either block.** Not the
date, not a row count, not the current weather. One volatile token
anywhere in the prefix makes every request a miss *and* charges the
write premium. Anything that changes turn to turn belongs in the
messages, below both breakpoints. This is the rule that the code
comment at the breakpoint repeats, because it is the one a future
change will break by accident.

**The generated halves are ordered explicitly.** The schema
description is built at request time from `pg_class`, and the query
that builds it had no `ORDER BY` -- a grouped query is free to return
the same twelve relations in a different order on the next request.
Same information, different text, and therefore a different cache
entry every time. Both generated queries now order deterministically.
This was a latent problem before caching existed: two identical
questions could put the model's reference material in a different
order.

**The schema list stays curated, and says what it left out.** The
model can already query anything RLS allows; `SCHEMA_RELATIONS` only
decides what it is *told about*, and describing `audit_log` or
`conversation_embeddings` would cost tokens on every request to no
purpose. The failure mode of a hand-kept list is a table nobody
remembers to add, so the function now logs which public relations are
not described, once per request. A new table shows up in the logs as a
line to act on or ignore, rather than as a gap nobody sees.

> **Superseded by [`0034`](0034-a-schema-change-has-to-explain-itself.md).**
> A log line is not a mechanism -- nobody reads function logs looking
> for a table that should have been added. The list was inverted:
> every public relation is described by default, and `NOT_DESCRIBED`
> holds the ones deliberately left out, with the reason. The rest of
> this ADR stands; only the direction of the list changed.

**Cache behaviour is reported, not assumed.** `cache_read_input_tokens`
and `cache_creation_input_tokens` come back on every turn; they are
logged server-side and shown in the app's own status line. A change
that quietly makes the prefix volatile shows up as reads falling to
zero, which is the only way anyone would ever notice.

## Consequences

- **A question with no tool call costs slightly more**, since it writes
  the cache at 1.25x and reads nothing back. Anything that touches a
  tool -- which is most of what this chat does -- more than repays it.
- **Measured on the live function**: a two-turn question drops from
  30,480 input tokens to about 20,600 equivalent; a six-turn one from
  91,440 to about 26,700. A follow-up asked within the cache's idle
  window reads the whole block back at a tenth of the price.
- **The idle window is five minutes**, refreshed on each hit. A producer
  working through a session keeps it warm; one question after lunch
  pays the write again. A one-hour window exists at a 2x write cost and
  is worth revisiting if usage turns out to be spread out rather than
  clustered.
- **A schema change invalidates the block, and that is correct.** It
  needs no bookkeeping: different text is a different entry. The first
  request after a migration pays the write.
- **This makes the prompt's assembly load-bearing in a new way.**
  Before, a nondeterministic prompt was untidy; now it is expensive.
  The ordering requirement is a real constraint on anything that later
  generates part of this prompt.
