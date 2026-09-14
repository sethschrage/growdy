-- The very first real question hit this: a model writing idiomatic SQL
-- almost always ends a statement with a semicolon, but execute_readonly_query
-- embeds the caller's query inside `from (%s) t` -- a bare trailing `;` is a
-- syntax error there, so every first attempt failed before ever running.
-- Strip one trailing semicolon (and surrounding whitespace) before wrapping.
-- This does not weaken the read-only guarantee: a genuine multi-statement
-- attempt (`select 1; select 2`) still has an internal semicolon after this
-- strip and still fails to parse as a single subquery expression.

create or replace function public.execute_readonly_query(query text)
returns setof json
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  cleaned_query text := regexp_replace(trim(query), ';\s*$', '');
begin
  perform set_config('statement_timeout', '5000', true);
  perform set_config('transaction_read_only', 'on', true);
  return query execute format('select to_json(t) from (%s) t limit 500', cleaned_query);
end;
$$;
