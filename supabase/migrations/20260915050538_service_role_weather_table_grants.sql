-- Fix: service_role was never granted table-level access to data_sources
-- or weather_observations -- both tables' only grants were to
-- authenticated, set when they were created, well before anything used
-- service_role against them. service_role's rolbypassrls=true skips RLS
-- policies, but table-level GRANTs are a separate mechanism RLS bypass
-- does not cover -- sync-scheduled-weather's admin client (docs/decisions/0020)
-- is the first thing in this project to need service_role access to
-- regular tables (the two Vault helpers use SECURITY DEFINER instead,
-- which runs as the function owner, not as service_role itself), so this
-- gap was never exercised until now. Confirmed live: querying
-- information_schema.role_table_grants showed service_role had only
-- REFERENCES/TRIGGER/TRUNCATE on both tables -- not SELECT, INSERT, or
-- UPDATE -- which is exactly why syncWeatherSourceChunk's writes were
-- silently failing with "permission denied for table weather_observations"
-- (and, for data_sources, why an update to record last_error had no
-- visible effect at all).
grant select, update on public.data_sources to service_role;
grant select, insert on public.weather_observations to service_role;
