-- Enabling PostGIS now because it's actually needed: an unplotted planting
-- (a wild tree, a weed, an invasive found somewhere in a parcel) has no
-- plot/row/position at all -- a coordinate is the only way to locate it.
-- Installed into the `extensions` schema per Supabase convention, keeping
-- `public` free of extension-owned objects.
create extension if not exists postgis with schema extensions;
