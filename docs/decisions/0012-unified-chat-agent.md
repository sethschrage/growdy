# 0012. One chat agent with a growing tool list, not one Edge Function per capability

**Status:** superseded by 0016

## Context

`0009` and `0010` each gave their own trust boundary a home in its own Edge
Function: `observation-chat` can draft a submission, `data-qa` cannot --
"no code path from this function into a write, not even an accidental
one," as `0010` put it. That was the right call at the time: this
project's evidence-driven approach means every capability so far --
`parcel_lookup`, `variety_lookup` -- has arrived exactly once real usage
asked for it, and the two-function split kept each one's blast radius
obviously bounded while the pattern was still new.

Real usage now pushes the other way. A producer has to pick "Ask a
question" or "Log an observation" before they've necessarily decided
which one they mean, and every capability still on the roadmap --
open-ended pending observations, reporting, whatever comes after that --
would otherwise mean choosing which of two prompts (or a third, a
fourth) it belongs to, then maintaining that split forever. The actual
ask is a single chat that keeps gaining abilities, not a fixed set of
separately-gated screens.

Production tool-using agents -- including the one this conversation is
happening inside -- don't solve this by keeping read and write
capabilities in separate processes. Claude's own tool-use model
routinely holds both read tools and side-effecting tools in one
conversation; ChatGPT's function calling and coding agents like Cursor
work the same way. What makes that safe isn't which process can reach
which tool -- it's a human confirmation step before anything
consequential actually happens. Growdy already has exactly that,
independent of which Edge Function drafted the intent: the client shows
a draft and waits for an explicit Confirm click before any insert, and
even after that, `0009`'s insert policy --
`with check (status = 'pending')` -- means no code path can land a row
as anything but pending, no matter what the client sends. That
database-level guarantee, not the Edge Function boundary, is the actual
backstop, and it doesn't change here.

## Decision

`observation-chat` and `data-qa` become one Edge Function, one system
prompt, one tool list: `describe_query` and `submit_observation_draft`
move in unchanged -- same shapes, same client-side resolvers, same
Confirm-before-write UI. Every future capability joins that same list
as its own named tool, the same way `parcel_lookup` and `variety_lookup`
joined `describe_query`'s query types -- not as a new Edge Function, not
as a new manually-chosen mode.

The account menu's "Ask a question" / "Log an observation" toggle goes
away, since there's one chat to start typing into.

`conversations.mode` stops being fixed by which button was clicked at
the start of a session (there's no longer a button) and instead reflects
what actually happened: the client sets it based on whether the session
produced a submission, not which entry point was chosen. No migration --
same two-value column, a different rule for what the client writes to
it.

## Consequences

- Adding a new "thing you can do via chat" now means one new tool
  description and one new client-side resolver -- not a parallel prompt
  to keep in sync, not a decision about which existing mode it belongs
  to.
- The safety story shifts from "which function can this code reach" to
  "what does a human confirm before it's real" -- worth stating plainly,
  since the confirm-and-pending-review mechanics were always doing the
  real work; the two-function split was an additional, not load-bearing,
  precaution.
- `observation-chat` and `data-qa` as separate deployed functions go
  away; whatever replaces them needs its own deploy the same way either
  did.
- A single merged prompt has to correctly distinguish "answer this" from
  "log this" turn by turn, where two prompts previously only had to
  handle one job each -- worth watching for misclassification once this
  ships, with the same evidence-driven eye applied to everything else in
  this project.
- This supersedes `0009` and `0010`'s structural split into separate
  Edge Functions per trust level, while keeping both ADRs' actual safety
  mechanisms -- `0009`'s pending-status enforcement, `0010`'s "AI drafts
  intent, client resolves and executes, never a generated query" -- fully
  intact and unchanged.
