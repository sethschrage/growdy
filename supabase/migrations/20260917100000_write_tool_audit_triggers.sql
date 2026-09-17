-- Wires up 0022's write tool for real. propose_write_query/confirm_write
-- and the audit_row_change() trigger function have existed since 0022
-- shipped, but the trigger was never actually attached to any table --
-- confirmed directly (information_schema.triggers returned zero rows for
-- the public schema). 0022 is explicit that this is not optional: "Only
-- confirm_write's real commit ever fires this trigger... it has to exist
-- and be verified working before confirm_write is granted to anyone."
-- Until this migration, a write via confirm_write against any table
-- would have committed with zero audit trail -- unused in practice since
-- nothing called these functions yet (chat is only wired up to
-- propose_write_query, never confirm_write, in this same change), but a
-- real gap in the mechanism itself, worth closing before anything relies
-- on it.
--
-- Attached to every table that already has a real INSERT/UPDATE/DELETE
-- grant to `authenticated` and has both `id` and `producer_id` columns --
-- audit_row_change() reads both directly off NEW/OLD. One table with a
-- direct write grant, parcel_shares, is deliberately excluded: its
-- access-scoping column is shared_with_producer_id, not producer_id, so
-- the generic trigger's fixed assumption doesn't fit it as-is. Onboarding
-- it needs its own pass (0022's own "per-table onboarding, not
-- automatic" checklist), not a hack to make one column name cover two
-- shapes.
create trigger audit_row_change
  after insert or update or delete on public.artifacts
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.conversations
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.data_sources
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.observation_candidates
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.observations
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.parcels
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.plot_rows
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.producer_memory
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

create trigger audit_row_change
  after insert or update or delete on public.weather_observations
  for each row execute function public.audit_row_change();
