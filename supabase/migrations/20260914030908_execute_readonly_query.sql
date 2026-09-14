-- The chat now writes its own SQL to answer questions instead of picking
-- from a fixed menu of query shapes that a hand-written resolver executes
-- (0016) -- one general capability instead of a new resolver function per
-- question shape, and one that can answer a question its designer never
-- anticipated (e.g. "are they all alive"), which a fixed shape never can.
--
-- Read-only is enforced by Postgres itself, not by inspecting the query
-- text: wrapping the caller's query as `from (%s) t` means only a
-- SELECT-shaped statement can even parse there (verified directly: a
-- data-modifying CTE nested this way is rejected by Postgres' own grammar
-- -- "WITH clause containing a data-modifying statement must be at the top
-- level"), and `transaction_read_only` is the backstop that would still
-- catch a write hidden any other way a plain grammar check might miss
-- (verified: a plain `delete` under this setting fails with "cannot
-- execute DELETE in a read-only transaction"). `security invoker` means it
-- runs as the calling producer, so RLS scopes every result exactly as it
-- does for any other authenticated query -- no elevated access of any kind.

create or replace function public.execute_readonly_query(query text)
returns setof json
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  perform set_config('statement_timeout', '5000', true);
  perform set_config('transaction_read_only', 'on', true);
  return query execute format('select to_json(t) from (%s) t limit 500', query);
end;
$$;

grant execute on function public.execute_readonly_query(text) to authenticated;

-- variety_lookup_counts/parcel_lookup_counts (0015) are superseded by the
-- tool above but deliberately NOT dropped here -- this migration is purely
-- additive, so it carries zero risk to the still-live old Chat.tsx/Edge
-- Function while this PR is in flight, and a rollback of the application
-- code alone (no follow-up migration needed) is enough to fully restore
-- the previous behavior. Drop them in a later migration once the new
-- chat has run successfully for a while.
