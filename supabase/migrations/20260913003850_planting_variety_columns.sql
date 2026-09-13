-- planting.species (free text) is replaced by variety_id, a FK into the
-- shared public.plant_types vocabulary (kind = 'variety'), used for an
-- own-rooted plant's single identity. Two more nullable FKs are added for
-- grafted plants: scion_variety_id (kind = 'scion') and
-- rootstock_variety_id (kind = 'rootstock') -- an ungrafted or wild plant
-- leaves both null and uses variety_id instead. See docs/decisions/0004.
--
-- No pairing constraint between scion_variety_id and rootstock_variety_id:
-- real data included a case where the grower wasn't certain which of two
-- clones was actually planted where, so forcing both-or-neither would
-- have blocked recording a partially-known graft.
--
-- nickname is a producer's own informal label for a specific graft
-- combination -- free text, per-planting, not deduplicated the way
-- plant_types entries are. Repetition across many plantings that share
-- the same graft combination is expected and not something the schema
-- tries to prevent.
--
-- planting had zero rows at the time of this migration, so dropping
-- species loses no data.

alter table public.planting
  drop column species,
  add column variety_id uuid references public.plant_types (id),
  add column scion_variety_id uuid references public.plant_types (id),
  add column rootstock_variety_id uuid references public.plant_types (id),
  add column nickname text;

comment on column public.planting.variety_id is 'What this planting is, for an own-rooted plant -- references public.plant_types (kind = variety). Null for a grafted plant, which uses scion_variety_id/rootstock_variety_id instead.';
comment on column public.planting.scion_variety_id is 'Scion (fruiting/above-ground) variety for a grafted plant, referencing public.plant_types (kind = scion). Null for an own-rooted or wild plant.';
comment on column public.planting.rootstock_variety_id is 'Rootstock variety for a grafted plant, referencing public.plant_types (kind = rootstock). Null for an own-rooted or wild plant.';
comment on column public.planting.nickname is 'Producer''s own informal label for a specific graft combination (e.g. "Gamay114"). Free text, per-planting -- not a shared/deduplicated reference like plant_types.';

create index planting_variety_id_idx on public.planting (variety_id);
create index planting_scion_variety_id_idx on public.planting (scion_variety_id);
create index planting_rootstock_variety_id_idx on public.planting (rootstock_variety_id);
