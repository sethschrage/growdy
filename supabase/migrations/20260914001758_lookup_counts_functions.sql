-- The chat's variety and parcel lookups fetch every matching row from
-- planting_readable into the client just to count and group them in JS
-- (0013) -- fine until a real search matches more rows than PostgREST's
-- default row cap (1000), at which point the reported total silently
-- reflects however many rows fit under that cap, not the real count. A
-- real search for "Gamay" hit this exactly: 2,004 matching rows, reported
-- to the producer as 1,000. These do the counting in SQL instead, where a
-- GROUP BY costs nothing close to what shipping thousands of rows to the
-- client does, and can never be truncated by a limit that only applies to
-- the rows actually returned in a response body.

create or replace function public.variety_lookup_counts(search text)
returns table (parcel text, plot text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select parcel, plot, count(*)
  from public.planting_readable
  where variety ilike '%' || search || '%'
     or scion ilike '%' || search || '%'
     or rootstock ilike '%' || search || '%'
     or nickname ilike '%' || search || '%'
  group by parcel, plot;
$$;

create or replace function public.parcel_lookup_counts(target_parcel text)
returns table (plot text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select plot, count(*)
  from public.planting_readable
  where parcel ilike target_parcel
  group by plot;
$$;

grant execute on function public.variety_lookup_counts(text) to authenticated;
grant execute on function public.parcel_lookup_counts(text) to authenticated;
