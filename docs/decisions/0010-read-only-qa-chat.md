# 0010. Read-only Q&A chat resolves against known views, not generated SQL

**Status:** superseded by 0016

## Context

Producers can already submit observations through chat (`0009`), but the
app still can't answer a question -- "what's planted at North row 5?",
"which positions are blocked right now?" -- without someone querying the
database directly. That's the other half of "interact with the data via
chat" this app was meant to enable for non-maintainer users in the first
place.

The obvious way to build this is to let an LLM turn a natural-language
question into a database query. Two shapes were considered: let the model
generate SQL (or a query-builder call) directly, or have it extract
structured intent that the client resolves through a small, fixed set of
known queries -- the same pattern `0009` already established for
observation submission, where the model drafts a plot/row/position and
the client does the actual lookup.

Letting a model generate arbitrary queries is a meaningfully different
trust boundary than extracting a few named fields: even scoped to a
read-only role and RLS, it widens what a prompt-injected or simply wrong
response could do, and it works against `0008`'s "app stays thin"
principle by pushing real query logic into a prompt instead of ordinary
client code.

## Decision

Q&A gets its own Edge Function, `data-qa`, following the exact shape of
`observation-chat`: it holds the Claude API key, is the only thing that
calls the LLM, and never touches the database itself. Its system prompt
is read-only and has no submission tool at all -- there is no code path
from this function into a write, not even an accidental one.

The function's one tool, `describe_query`, extracts what's being asked
into a small fixed shape: which kind of question it is (a planting
lookup, or a position-status question) plus whatever plot/row/position/
status filters were mentioned. The client resolves that against
`planting_readable` or `position_status` directly -- the same two views
`observation-chat` already reads from, scoped automatically by RLS -- no
new database surface, no generated SQL, no query the client wasn't
already capable of running.

Scope for this pass is limited to the same shape of question the
existing observation lookup already answers, just asked instead of led
into a submission: single-planting lookups and blocked/open status.
Broader questions -- counts, aggregates, free-text search across notes
-- are deferred until real usage shows they're actually wanted, the same
evidence-driven approach used throughout this project.

The mode is reached from the existing account menu ("Ask a question,"
alongside "New chat") rather than a separate screen, since it's the same
chat UI with a different system prompt and no submission step.

## Consequences

- A wrong or ambiguous question fails safely: the model can only ever
  hand back a request to run one of two known, parameterized reads,
  never an arbitrary query.
- Adding a genuinely new kind of question later (a count, a cross-field
  search) means adding a new named query type and a corresponding
  client-side resolver, not touching the LLM's trust boundary at all --
  the fixed-shape-per-query-type approach also caps what "richer
  questions" can look like without that additional client work.
- This is the second Edge Function in the project, and the second time
  the "AI drafts intent, client resolves and executes" split from `0009`
  has proven out -- worth treating as the standing pattern for any
  future chat-based feature, not a one-off.
