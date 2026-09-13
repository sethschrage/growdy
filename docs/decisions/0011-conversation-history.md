# 0011. Conversation history is a new table, written by the client after every message

**Status:** accepted

## Context

Both chat modes are ephemeral today. `observation-chat` (`0009`) only leaves
a trace when a producer actually confirms an observation -- the resulting
row's `transcript` column preserves the exchange that led to it, but an
abandoned chat, or one that never reached confirmation, disappears
entirely. `data-qa` (`0010`) leaves no trace at all: it's read-only by
design and never touches the database, so no Q&A conversation has ever
been stored anywhere.

A producer wants to browse everything they've ever asked or submitted --
"all time history," not just the current session -- reachable from the
account menu, previewing each past conversation by its opening message.
Neither existing mechanism supports this: `observations.transcript` is
keyed to a confirmed fact, not a conversation, so a single chat that
produced three observations would show as three separate entries with
the same opening message repeated three times, and a Q&A session
wouldn't show up at all.

## Decision

A new table, `conversations`, one row per chat session in either mode:

```sql
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  mode text not null check (mode in ('submit', 'ask')),
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS follows the same shape as every other table: select/insert/update
gated by `private.user_can_access_producer(producer_id)`. No delete
policy for now -- nothing in the app removes a conversation yet.

The client, not an Edge Function, owns writing this. Each chat component
generates one `id` (`crypto.randomUUID()`) when it mounts -- the same
moment `chatKey` already forces a remount today -- and upserts the full
`transcript` array to that row after each message exchange: insert on
the first message, update (whole-array replace, not a partial patch)
after that. This keeps the write path as plain client code with no new
server logic, the same "AI drafts, client executes" split `0009` and
`0010` already established -- it just means the client now executes a
write after Q&A turns too, not only after a confirmed observation.

`observations.transcript`/`status` are untouched. They answer a
different question (was this specific submitted fact reviewed and
approved) than `conversations` does (what did this session actually
say) -- no migration, no backfill, two tables for two purposes.

History is reachable from the account menu as a slide-out drawer, not a
permanent on-screen rail, so it doesn't cost screen space on the chat
itself. It lists every conversation for the producer, both modes
together, newest first, each as a small circular button; clicking one
expands it to preview its first user message. No pagination or time
cutoff for v1 -- "all time" literally, revisited only if the list
actually gets unwieldy at real scale.

## Consequences

- Every Q&A question a producer asks becomes permanently stored, which
  wasn't true before this. That's the deliberate point of this ADR, but
  it's a real behavior change: `data-qa`'s "never touches the database"
  property (`0010`) was previously also a "leaves no trace" property,
  and after this it's only the former -- the Edge Function itself still
  never touches the database, but the conversation it's part of now
  does, via the client.
- Whole-array replace on every update means the payload sent to Supabase
  grows with the conversation's length each time -- fine at the message
  counts a single sitting produces, but a design that would need
  revisiting if conversations were expected to run very long.
- Browsing past chats and reviewing submitted-but-unconfirmed
  observations remain two different screens backed by two different
  tables, rather than one unified "everything that ever happened" view
  -- acceptable since they answer different questions, but worth naming
  as a choice rather than an oversight.
