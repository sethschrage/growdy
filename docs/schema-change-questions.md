# Questions a schema change has to answer

A migration that creates a table, creates a view, or adds a column
answers these six questions **in a comment block at the top of the
migration file**, before the first statement.

They are not a formality. Every one of them is something the database
cannot infer, that someone -- or the chat, which reads the schema's own
comments at request time -- will need later and will otherwise have to
reconstruct by reading application code and guessing.

`scripts/check-migration-answers.mjs` fails the PR if a tag is missing
or answered with a placeholder. It cannot tell a good answer from a bad
one; it can only tell that somebody was asked.

## The six

**`Purpose:`** What question can a producer ask, or what action can they
take, that is impossible today? If the answer is "we might want it
later", that is a reason not to add the column yet. A column nothing
reads is a column nobody maintains.

**`Columns:`** What each new column means: its unit, its range, and what
`null` means if it is nullable. This text is the source for the
`COMMENT ON COLUMN` statements in the same file -- write it once, here,
and the comments follow from it.

**`Relations:`** Which existing row does this hang off, as a foreign
key, and why that parent rather than another. A plot belongs to a
parcel; a row belongs to a plot. If there is deliberately no foreign
key, say why -- that is a real choice and it needs a reason, because the
chat is told about every foreign key and will otherwise join on a hunch.

**`Access:`** Which producer owns a row here, and which policy enforces
it. Every tenant-scoped table in this schema carries `producer_id` and
an RLS policy that checks it against the caller's profile. A new table
without one is a data leak, not a missing feature.

**`Chat:`** The chat describes every public relation to the model by
default (`supabase/functions/chat/index.ts`). So the question is only
whether this one should be *left out* -- and if so, the reason goes in
`NOT_DESCRIBED` in that file, in the same PR. Leaving it in costs tokens
on every request; leaving it out means the model cannot reason about it
at all.

**`Backfill:`** What happens to the rows that already exist. A `NOT
NULL` column on a populated table needs a default or a backfill, and a
column that is nullable only because backfilling was deferred should say
so, so the next person knows the nullability is temporary rather than
meaningful.

## What it looks like

```sql
-- Purpose: Producers want to know which rows were replanted after the
--   2025 frost, which today means reading it off a photo caption.
-- Columns: replanted_on -- the date the row was replanted, producer's
--   local date, not a timestamp. Null means never replanted, which is
--   the normal case.
-- Relations: None new. Hangs off plot_rows, which already carries the
--   producer_id the policy checks.
-- Access: Inherited -- plot_rows' existing producer_id policy covers it.
-- Chat: Described. "When was this row replanted" is exactly the kind of
--   question this exists to answer.
-- Backfill: None. Existing rows are null, which reads correctly as
--   "never replanted".

alter table public.plot_rows add column replanted_on date;

comment on column public.plot_rows.replanted_on is
  'Date this row was replanted, in the producer''s local date. Null means never replanted.';
```

## Three places this is enforced, and what each one can actually do

**`.claude/settings.json` blocks the write.** A `PreToolUse` hook runs
[`scripts/migration-write-guard.mjs`](../scripts/migration-write-guard.mjs)
before any agent writes or edits a file under `supabase/migrations/`. If
the result would create a table or add a column without the six answers,
the tool call is refused and the agent is told to put the questions to
the person who asked. This is the layer that fires *while the person who
knows the answers is still in the conversation*.

**CI blocks the merge.** `scripts/check-migration-answers.mjs` runs the
same rule -- literally the same function -- over the migrations a PR
changes. It catches what the hook cannot: a migration written in an
editor, by another tool, or on another machine.

**`scripts/check-schema-docs.mjs` blocks the undocumented column.** The
answers are prose in a file; the `COMMENT ON` is what the chat and the
next reader actually see. That check makes sure the second one exists.

What none of them can do is make anyone *ask*. A rule enforced on files
can only see files, and six plausible sentences invented by whoever was
holding the keyboard pass every one of these checks. What the three of
them buy is that an unanswered migration cannot be created quietly: the
failure happens in front of the person who can answer, at the moment the
file is written, and the answers land in the diff and in the schema
where a wrong one is visible rather than merely absent.

## Why a file and not a habit

Because the failure is silent. A column with no comment renders in the
chat's schema description as a perfectly well-formed line with no
meaning attached, and nothing anywhere errors -- the model simply
reasons about a name. Half the columns in this database are in that
state today, and every one of them got there while somebody was busy
with something more interesting. See
[`0034`](decisions/0034-a-schema-change-has-to-explain-itself.md).
