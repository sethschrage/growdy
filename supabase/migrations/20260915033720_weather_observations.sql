-- Third piece of external data channels (docs/decisions/0019): the actual
-- ingested readings. Category-scoped (weather_observations, not
-- tempest_observations) so a future second weather provider writes into
-- the same table -- adding one means new ingestion code and a new
-- data_providers row, not new schema.
--
-- Every field here is real: the complete raw obs_st field set WeatherFlow's
-- own API documents for a Tempest station reading (confirmed directly,
-- see docs/decisions/0019 and the plan this PR implements -- not the
-- partial set an earlier pass mistakenly pulled from a different,
-- derived-summary part of the API). Deliberately no raw/jsonb catch-all:
-- a field the provider returns with no column here is never silently
-- stored anywhere (see ingest-weather's validation logic) -- it surfaces
-- as data_sources.last_warning instead, so a human decides whether it
-- earns a real, reviewed column. A numeric column also has nowhere for
-- an injected instruction to hide, which is the point as much as the
-- structure is.
create table public.weather_observations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources (id),
  producer_id uuid not null references public.producers (id),
  observed_at timestamptz not null,
  wind_lull numeric,
  wind_avg numeric,
  wind_gust numeric,
  wind_direction numeric,
  wind_sample_interval integer,
  station_pressure numeric,
  air_temperature numeric,
  relative_humidity numeric,
  illuminance numeric,
  uv numeric,
  solar_radiation numeric,
  precip numeric,
  precip_type smallint check (precip_type in (0, 1, 2, 3)),
  lightning_strike_avg_distance numeric,
  strike_count integer,
  battery_voltage numeric,
  report_interval integer,
  created_at timestamptz not null default now(),
  unique (source_id, observed_at)
);

comment on table public.weather_observations is 'One row per timestamped Tempest station reading. Append-only via upsert on (source_id, observed_at), which is what makes backfill/retry idempotent -- see docs/decisions/0019.';
comment on column public.weather_observations.observed_at is 'The reading''s own timestamp (the provider''s Time Epoch field), not when we ingested it -- see created_at for that.';
comment on column public.weather_observations.wind_lull is 'Minimum 3-second wind sample over the report interval, in m/s.';
comment on column public.weather_observations.wind_avg is 'Average wind speed over the report interval, in m/s.';
comment on column public.weather_observations.wind_gust is 'Maximum 3-second wind sample over the report interval, in m/s.';
comment on column public.weather_observations.wind_direction is 'Wind direction in degrees.';
comment on column public.weather_observations.wind_sample_interval is 'The wind measurement''s own sample interval, in seconds -- distinct from report_interval.';
comment on column public.weather_observations.station_pressure is 'Raw station-level barometric pressure in millibars -- not sea-level-adjusted.';
comment on column public.weather_observations.air_temperature is 'Degrees Celsius.';
comment on column public.weather_observations.relative_humidity is 'Percent.';
comment on column public.weather_observations.illuminance is 'Lux.';
comment on column public.weather_observations.uv is 'UV index.';
comment on column public.weather_observations.solar_radiation is 'Watts per square meter.';
comment on column public.weather_observations.precip is 'Rain accumulated over the previous minute, in millimeters -- an instantaneous-ish rate, not a daily total.';
comment on column public.weather_observations.precip_type is 'One of exactly four values: 0 none, 1 rain, 2 hail, 3 rain and hail. Check-constrained since this is a closed, structurally-relevant enum, same treatment as plant_types.kind.';
comment on column public.weather_observations.lightning_strike_avg_distance is 'Average distance of detected lightning strikes, in kilometers.';
comment on column public.weather_observations.strike_count is 'Number of lightning strikes detected during the reporting period.';
comment on column public.weather_observations.battery_voltage is 'Station battery voltage -- a health signal for the physical sensor, not a weather reading.';
comment on column public.weather_observations.report_interval is 'The station''s reporting interval in minutes.';

create index weather_observations_source_id_observed_at_idx on public.weather_observations (source_id, observed_at);
create index weather_observations_producer_id_idx on public.weather_observations (producer_id);

alter table public.weather_observations enable row level security;

create policy "weather_observations: member can view producer's readings"
  on public.weather_observations for select
  using (private.user_can_access_producer(producer_id));

create policy "weather_observations: member can insert producer's readings"
  on public.weather_observations for insert
  with check (private.user_can_access_producer(producer_id));

-- No update/delete policy: append-only, same as observations.

grant select, insert on public.weather_observations to authenticated;
