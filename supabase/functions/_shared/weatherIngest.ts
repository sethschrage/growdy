// The Tempest fetch/parse/validate/upsert logic, shared by every caller
// that syncs a weather data_source -- the user-invoked ingest-weather
// (one source, forwarded JWT) and the scheduled sync-scheduled-weather
// (every enabled source, admin client). One definition, not two that can
// drift apart -- see docs/decisions/0019 and 0020.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const TEMPEST_API_BASE = "https://swd.weatherflow.com/swd/rest";
export const CHUNK_SECONDS = 5 * 24 * 60 * 60; // Tempest's own cap for 1-minute-resolution ranges
const RAW_OBS_FIELD_COUNT = 18; // the complete obs_st field count -- see docs/decisions/0019

// [min, max] plausibility range per field (see docs/decisions/0019). A
// value outside its range is nulled out and named in last_warning, not
// stored as-is -- the rest of the reading is still stored regardless.
const FIELD_RANGES: Record<string, [number, number]> = {
  wind_lull: [0, 120],
  wind_avg: [0, 120],
  wind_gust: [0, 120],
  wind_direction: [0, 360],
  station_pressure: [700, 1100],
  air_temperature: [-60, 60],
  relative_humidity: [0, 100],
  illuminance: [0, 130000],
  uv: [0, 20],
  solar_radiation: [0, 1500],
  precip: [0, 500],
  lightning_strike_avg_distance: [0, 40],
  battery_voltage: [0, 5],
};

type ParsedReading = {
  observed_at: string;
  wind_lull: number | null;
  wind_avg: number | null;
  wind_gust: number | null;
  wind_direction: number | null;
  wind_sample_interval: number | null;
  station_pressure: number | null;
  air_temperature: number | null;
  relative_humidity: number | null;
  illuminance: number | null;
  uv: number | null;
  solar_radiation: number | null;
  precip: number | null;
  precip_type: number | null;
  lightning_strike_avg_distance: number | null;
  strike_count: number | null;
  battery_voltage: number | null;
  report_interval: number | null;
};

export type WeatherSource = {
  id: string;
  producer_id: string;
  external_id: string;
  backfill_status: string | null;
  backfill_cursor: string | null;
  backfill_start: string | null;
  last_synced_at: string | null;
};

// Maps one raw obs_st array (positional -- see WeatherFlow's UDP reference,
// docs/decisions/0019) to named, range-validated fields. A field failing
// its plausibility range is nulled out and named in the returned warnings
// -- a bad field doesn't discard the rest of an otherwise-good reading.
function parseReading(obs: unknown[]): { reading: ParsedReading; warnings: string[] } {
  const warnings: string[] = [];

  function field(index: number, name: string, range?: [number, number]): number | null {
    const value = obs[index];
    if (value === null || value === undefined) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) {
      warnings.push(`${name}: non-numeric value ${JSON.stringify(value)}`);
      return null;
    }
    if (range && (num < range[0] || num > range[1])) {
      warnings.push(`${name}: ${num} outside plausible range [${range[0]}, ${range[1]}]`);
      return null;
    }
    return num;
  }

  const precipType = field(13, "precip_type");

  const reading: ParsedReading = {
    observed_at: new Date(Number(obs[0]) * 1000).toISOString(),
    wind_lull: field(1, "wind_lull", FIELD_RANGES.wind_lull),
    wind_avg: field(2, "wind_avg", FIELD_RANGES.wind_avg),
    wind_gust: field(3, "wind_gust", FIELD_RANGES.wind_gust),
    wind_direction: field(4, "wind_direction", FIELD_RANGES.wind_direction),
    wind_sample_interval: field(5, "wind_sample_interval"),
    station_pressure: field(6, "station_pressure", FIELD_RANGES.station_pressure),
    air_temperature: field(7, "air_temperature", FIELD_RANGES.air_temperature),
    relative_humidity: field(8, "relative_humidity", FIELD_RANGES.relative_humidity),
    illuminance: field(9, "illuminance", FIELD_RANGES.illuminance),
    uv: field(10, "uv", FIELD_RANGES.uv),
    solar_radiation: field(11, "solar_radiation", FIELD_RANGES.solar_radiation),
    precip: field(12, "precip", FIELD_RANGES.precip),
    precip_type: precipType !== null && [0, 1, 2, 3].includes(precipType) ? precipType : null,
    lightning_strike_avg_distance: field(14, "lightning_strike_avg_distance", FIELD_RANGES.lightning_strike_avg_distance),
    strike_count: field(15, "strike_count"),
    battery_voltage: field(16, "battery_voltage", FIELD_RANGES.battery_voltage),
    report_interval: field(17, "report_interval"),
  };

  return { reading, warnings };
}

async function fetchChunk(deviceId: string, apiKey: string, timeStart: number, timeEnd: number): Promise<unknown[][]> {
  const url = `${TEMPEST_API_BASE}/observations/device/${deviceId}?time_start=${timeStart}&time_end=${timeEnd}&api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Tempest API error (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  if (data.type && data.type !== "obs_st") {
    throw new Error(`Unsupported device type "${data.type}" -- only a Tempest (obs_st) station is supported`);
  }
  return (data.obs ?? []) as unknown[][];
}

// Fetches and stores one bounded chunk for one source -- either the next
// backward step of backfill, or everything since last_synced_at once
// backfill is complete. Never throws for an ingestion-level failure (a bad
// API call, a validation issue); those are reported in the return value so
// a caller looping over many sources can isolate one failure from the rest.
export async function syncWeatherSourceChunk(
  supabase: SupabaseClient,
  source: WeatherSource,
  apiKey: string,
): Promise<{ done: boolean; error?: string; rows_processed?: number }> {
  const isBackfilling = source.backfill_status !== "complete";
  const backfillStartEpoch = source.backfill_start ? Math.floor(new Date(source.backfill_start).getTime() / 1000) : 0;

  let timeStart: number;
  let timeEnd: number;
  if (isBackfilling) {
    timeEnd = source.backfill_cursor
      ? Math.floor(new Date(source.backfill_cursor).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    timeStart = Math.max(timeEnd - CHUNK_SECONDS, backfillStartEpoch);
  } else {
    timeStart = source.last_synced_at
      ? Math.floor(new Date(source.last_synced_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - CHUNK_SECONDS;
    timeEnd = Math.floor(Date.now() / 1000);
  }

  let obsRows: unknown[][];
  try {
    obsRows = await fetchChunk(source.external_id, apiKey, timeStart, timeEnd);
  } catch (err) {
    await supabase.from("data_sources").update({ last_error: String(err) }).eq("id", source.id);
    return { done: false, error: String(err) };
  }

  const warnings: string[] = [];
  const rowsToUpsert = obsRows.map((obs) => {
    if (obs.length !== RAW_OBS_FIELD_COUNT) {
      warnings.push(
        `observation array had ${obs.length} fields, expected ${RAW_OBS_FIELD_COUNT} -- Tempest's response shape may have changed`,
      );
    }
    const { reading, warnings: fieldWarnings } = parseReading(obs);
    warnings.push(...fieldWarnings);
    return { source_id: source.id, producer_id: source.producer_id, ...reading };
  });

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("weather_observations")
      .upsert(rowsToUpsert, { onConflict: "source_id,observed_at" });
    if (upsertError) {
      await supabase.from("data_sources").update({ last_error: upsertError.message }).eq("id", source.id);
      return { done: false, error: upsertError.message };
    }
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    last_error: null,
    // Deliberately not accumulated across runs -- only this run's
    // warnings, so an old, already-noticed warning doesn't linger
    // forever once whatever caused it stops happening.
    last_warning: warnings.length > 0 ? warnings.slice(0, 10).join("; ") : null,
  };

  let done: boolean;
  if (isBackfilling) {
    // An empty chunk is never treated as "reached the beginning" -- that's
    // unconfirmed (could mean before the station existed, could mean a
    // transient hiccup). Only the cursor actually reaching backfill_start
    // ends backfill.
    const reachedFloor = timeStart <= backfillStartEpoch;
    update.backfill_cursor = new Date(timeStart * 1000).toISOString();
    update.backfill_status = reachedFloor ? "complete" : "in_progress";
    if (reachedFloor) update.last_synced_at = nowIso;
    done = reachedFloor;
  } else {
    update.last_synced_at = nowIso;
    done = true;
  }

  await supabase.from("data_sources").update(update).eq("id", source.id);

  return { done, rows_processed: obsRows.length };
}
