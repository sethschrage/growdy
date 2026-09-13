-- Fixes Supabase performance advisor WARN 0003 (auth_rls_initplan): the
-- two profiles policies call auth.uid() directly in their USING clause,
-- which Postgres re-evaluates once per row instead of once per query.
-- Wrapping it as (select auth.uid()) lets Postgres hoist it into an
-- InitPlan, evaluated a single time. See:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- private.user_can_access_producer() -- used by the producers policy and
-- every policy below it -- isn't affected. The advisor only flags a
-- direct auth.<function>() call written in a policy's own USING/WITH
-- CHECK expression, not one wrapped inside a separate stable function.

alter policy "profiles: user can view own profile"
  on public.profiles
  using (id = (select auth.uid()));

alter policy "profiles: user can update own profile"
  on public.profiles
  using (id = (select auth.uid()));
