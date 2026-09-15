-- The chat's schema description (supabase/functions/chat/index.ts) is
-- built from these comments at request time, not hand-typed into the
-- prompt -- so a fact worth the model knowing belongs here, not patched
-- onto the system prompt (docs/decisions/0016; CONTRIBUTING.md's
-- "Designing tools for the model").
--
-- planting_readable's comment already said "prefer this over the raw
-- planting table" but never spelled out the one consequence that matters
-- for a bare "how many total X" question: a row here is one planting
-- *event*, not one physical position -- a replaced plant's row stays,
-- removed_date set, rather than being deleted. The model had removed_date
-- documented per-row but nothing connecting that to what count(*) means,
-- and answered a flat row count for "how many total plants" without
-- noting it included closed-out history from replants.
comment on view public.planting_readable is
  'planting with every FK resolved to its actual name, and a computed plot-row-position label, for browsing without manual joins -- prefer this over the raw planting table for most questions. One row per planting event, not per position: a replaced plant''s row stays here with removed_date set instead of being deleted, so count(*) over this view (or planting itself) totals every planting ever recorded, current and historical alike -- filter removed_date is null for what''s actually in the ground now.';

-- Same fact, for anyone reading the base table's own comment directly
-- (Table Editor, a future migration) rather than through the view.
comment on table public.planting is
  'One plant''s occupancy of a place (organized plot/row/position, or an unplotted location), from planted_date to nullable removed_date. Replacing a plant closes the old row and inserts a new one -- history is never overwritten, so count(*) here totals every planting ever recorded, not just what''s currently in the ground; filter removed_date is null for that.';
