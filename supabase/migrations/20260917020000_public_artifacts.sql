-- The first thing in this project a signed-out visitor can ever see.
-- Every other table is producer-scoped and RLS-locked; a shared chat
-- graphic needs the opposite -- reachable by anyone holding the exact
-- link, but never enumerable. RLS alone can't express that distinction
-- (a `using (true)` policy would let anon list every artifact, not just
-- fetch the one it already knows the id of) -- so the public read path
-- is a single SECURITY DEFINER function, not a table grant, the same
-- narrow-RPC shape add_data_source/create_producer_and_profile already
-- established for "one specific privileged action," here applied to a
-- privileged *read* instead of a write. See docs/decisions/0027.
--
-- Every row is a public artifact -- there's no private/unshared state
-- to model yet. Scope stays exactly what's needed now; a saved-but-not-
-- shared concept, if one ever proves out, is a later migration.

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  conversation_id uuid references public.conversations (id) on delete set null,
  title text,
  content text not null,
  created_at timestamptz not null default now()
);

comment on table public.artifacts is 'A chat-generated graphic (SVG) a producer chose to share via an unguessable link. id is the link -- 122 bits of randomness, not a separate slug. See docs/decisions/0027.';
comment on column public.artifacts.content is 'Raw SVG markup, sanitized at render time (DOMPurify, same as the inline chat copy) -- never trusted as pre-sanitized just because it is stored.';

create index artifacts_producer_id_idx on public.artifacts (producer_id);
create index artifacts_conversation_id_idx on public.artifacts (conversation_id);

alter table public.artifacts enable row level security;

-- Owner-only for now (there's no viewer for a producer's own saved list
-- yet -- that's 0.14.0's job) -- but zero-cost to add now, and its
-- absence would be a real foot-gun: a producer couldn't confirm their
-- own artifact exists through the app at all without it.
create policy "artifacts: member can view their own producer's artifacts"
  on public.artifacts for select
  using (private.user_can_access_producer(producer_id));

create policy "artifacts: member can create their own artifacts"
  on public.artifacts for insert
  with check (private.user_can_access_producer(producer_id));

grant select, insert on public.artifacts to authenticated;

-- The actual public path: no RLS policy for anon at all (default-deny,
-- same as every other table) -- the only way in is this one function,
-- looked up by exact id. A generic SELECT grant for anon would let
-- anyone list every producer's shared artifacts; a function call can't
-- be turned into a listable collection the way a REST table endpoint can.
create or replace function public.get_public_artifact(p_id uuid)
returns table (title text, content text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select title, content, created_at from public.artifacts where id = p_id;
$$;

comment on function public.get_public_artifact is 'The only public (anon-reachable) read path in this project. Point lookup by exact id only -- never a listable collection. See docs/decisions/0027.';

revoke execute on function public.get_public_artifact(uuid) from public;
grant execute on function public.get_public_artifact(uuid) to anon, authenticated;
