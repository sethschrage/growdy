# 0016. The chat writes and runs its own SQL, and no longer submits data

**Status:** proposed

## Context

Every version of the chat since `0009` shared one design: the model never sees or writes a real query. It only ever picks from a fixed, enumerated set of question shapes (`variety_lookup`, `parcel_lookup`, `planting_lookup`, `position_status`), and a hand-written client resolver executes a specific, reviewed query on its behalf. That held up well while the chat did a handful of things, but real use exposed its ceiling directly, in the same session, against real production data:

- Asked "are all those [Gamay] alive?" as a natural follow-up, the model had no tool for "status breakdown across a variety-wide result" -- only `position_status`, scoped to one plot+row -- and kept asking for a plot/row it didn't need. A fixed menu of shapes can't answer a question its designer didn't anticipate, no matter how the prompt is worded.
- `MAX_DETAILED_MATCHES = 25`, set before the model composed its own replies, was still quietly limiting what data the model got to reason over long after the reason for the cap was gone.
- A misspelling ("gamey" for "Gamay") broke a lookup, because getting an LLM to reliably normalize spelling *and* propagate that correction into a structured tool argument is unreliable by nature -- not a prompt-wording problem to word around.

Underneath all three: adding a new capability meant a new enumerated shape, a new resolver function, sometimes a new SQL aggregation function -- more custom machinery every time, for a system meant to eventually reason across many data sources (structured data plus retrieved/unstructured sources like weather, GIS, phenology, books), not just this one schema.

## Decision

Relax "the model never touches a query" for **reads only** -- reads can't corrupt data, and RLS still fully applies no matter what SQL runs. The chat now has one tool, `execute_readonly_query`, and writes whatever `SELECT`/`WITH ... SELECT` actually answers the question -- filtering, grouping, joining, and aggregating freely, including calling it more than once in a turn to narrow a prior search instead of asking a clarifying question it could answer itself.

Read-only is enforced by Postgres itself, not by trusting the model or inspecting the query text -- verified directly against production before writing any code: wrapping the caller's query as `from (%s) t` means Postgres' own grammar rejects a nested data-modifying CTE ("WITH clause containing a data-modifying statement must be at the top level"), and `set_config('transaction_read_only', 'on', true)` is the backstop that catches a write hidden any other way (`cannot execute DELETE in a read-only transaction`). `security invoker` plus a per-request Supabase client built from the caller's forwarded JWT (never the service role key) means every query is RLS-scoped exactly as if the browser ran it directly.

The schema description the model sees is generated at request time from `information_schema.columns`, not hand-typed into the prompt -- it can't drift the way hand-maintained prose repeatedly has elsewhere in this project.

Chat-based observation **submission** is removed entirely: no `submit_observation_draft` tool, no draft/confirm UI, no pending-review workflow. This is a different decision from removing the `observations` **table**, which stays completely untouched -- its 211 real rows turned out to be the original bulk field-note import from before the chat existed (`Replanted Higher 6/2`, `Late to Bud`, `No Char`, each tied to a real planting), not review data, and are exactly the kind of real signal a model with full read access should be able to draw on. Only the write path built around it goes away. How new data gets in, now that chat can't submit it, is an open question for whenever it's actually needed -- not decided here.

Not built here, deliberately: no pgvector/embeddings/RAG, no weather/GIS/phenology/book integrations. Nothing has been built toward any of them yet, and this project has consistently proven a pattern against one real need before generalizing (PostGIS, `plant_types`, Storage). What this decision buys for that future: a non-Postgres source has no "run arbitrary query" shape of its own, so it becomes its own small, self-describing tool -- one more tool, no further architecture change. No dedicated source-prioritization mechanism is added either; favoring one source over another is expressed through prompt instructions and each tool's own description, the same way tool choice already works.

## Consequences

- A question the model has never been asked before can still be answered, as long as it's answerable from the schema -- the ceiling is SQL's expressiveness, not a list of shapes someone remembered to add.
- The client (`app/src/Chat.tsx`) shrinks to sending a message once per turn and rendering the reply -- no resolver branches, no draft/confirm state, no client-side query building.
- Three prior ADRs' *mechanisms* are superseded, though not everything in them: `0010` (one resolver per query type -- the goal of safe, RLS-scoped reads is preserved by a different, stronger mechanism), `0009` and `0012` (chat-based submission and its ask/submit merge -- the feature no longer exists, though the `observations` table and its nullable `planting_id` from `0014` remain exactly as they are). `0015`'s two SQL functions (`variety_lookup_counts`, `parcel_lookup_counts`) are superseded by the model's own ad hoc SQL and deliberately left in place, unused, rather than dropped -- kept only so a rollback of the application code alone is enough to fully restore the previous behavior, with their removal deferred to its own later migration once this has run successfully for a while.
- `0013` (the model composes the answer, not a client template) is **not** superseded -- it's more true now than before, since the client does even less.
- Real risk surface is now "what SQL the model can write against a schema it can see," bounded by a read-only transaction, RLS, a hard row cap, and a statement timeout -- verified directly rather than assumed, and worth re-verifying any time the enforcement mechanism itself changes.
