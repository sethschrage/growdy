-- Two new categories in the Category/Provider/Source taxonomy
-- (docs/decisions/0019): "phenology" (USA-NPN's grape growth-stage
-- observations) and "location" (where the vineyard actually is, needed to
-- query "nearby" phenology data -- growdy has no stored location for a
-- producer anywhere today). Full names, not abbreviations, matching
-- "Tempest" rather than an acronym.
--
-- "Device" is the built-in phone/browser geolocation -- a second provider
-- ("Trimble", for an external GPS receiver) joins the "location" category
-- later; this only adds the one needed now.
insert into public.data_providers (category, name, enabled) values
  ('phenology', 'USA National Phenology Network', true),
  ('location', 'Device', true);
