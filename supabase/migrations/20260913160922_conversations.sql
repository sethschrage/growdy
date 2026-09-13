-- Conversation history (docs/decisions/0011): one row per chat session in
-- either mode, so a producer can browse everything they've ever asked or
-- submitted, not just what a confirmed observation's transcript happens
-- to preserve. The client owns writing this -- it generates one id per
-- session and upserts the full transcript array after each message --
-- not an Edge Function, keeping data-qa's "never touches the database"
-- property intact even though the conversation it's part of now does.
--
-- observations.transcript/status are untouched: they answer a different
-- question (was this specific submitted fact reviewed) than this table
-- does (what did this session actually say).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  mode text not null check (mode in ('submit', 'ask')),
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conversations is 'One row per chat session (either mode), holding its full message transcript. See docs/decisions/0011.';

create index conversations_producer_id_idx on public.conversations (producer_id);

alter table public.conversations enable row level security;

create policy "conversations: member can view producer's conversations"
  on public.conversations for select
  using (private.user_can_access_producer(producer_id));

create policy "conversations: member can start a conversation"
  on public.conversations for insert
  with check (private.user_can_access_producer(producer_id));

create policy "conversations: member can update producer's conversations"
  on public.conversations for update
  using (private.user_can_access_producer(producer_id))
  with check (private.user_can_access_producer(producer_id));

grant select on public.conversations to authenticated;
grant insert on public.conversations to authenticated;
grant update on public.conversations to authenticated;
