-- Every table in this schema was missing the base grant to
-- authenticated -- RLS policies were all correctly in place, but a plain
-- GRANT for whatever command each policy allows (SELECT everywhere,
-- INSERT on observations, UPDATE on profiles) is a separate, more basic
-- privilege check Postgres makes before row-level security is even
-- evaluated. Without it, every request from a real signed-in user was
-- denied outright, no matter what any policy said.
--
-- This went unnoticed since every verification query all along this
-- project ran through an elevated connection that bypasses this check
-- entirely. The first genuinely authenticated request -- from the
-- chat-based observation flow (docs/decisions/0009) -- hit it
-- immediately, on every single table it touched. Exactly the kind of
-- gap the app exists to surface (docs/decisions/0008); this one just
-- turned out to be foundational rather than a single view.
--
-- Once granted, access is still correctly scoped by each table's
-- existing RLS policies -- this migration adds no new policies, only
-- the baseline privilege those policies always assumed was already
-- there.

grant select on public.producers to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select on public.parcels to authenticated;
grant select on public.plots to authenticated;
grant select on public.plot_rows to authenticated;
grant select on public.planting to authenticated;
grant select on public.plant_types to authenticated;
grant select on public.observations to authenticated;
grant insert on public.observations to authenticated;
