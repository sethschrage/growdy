// The one service_role code path in this project (see
// docs/decisions/0020). Invoked hourly by pg_cron (via pg_net, see the
// migration that schedules it) to keep every enabled weather source
// up to date without depending on a producer having the app open --
// docs/decisions/0019's original v1 trade-off, revisited once real use
// showed it wasn't acceptable.
//
// Never called from a browser: no CORS handling, and no forwarded user
// JWT -- authorization is a shared secret minted into Supabase Vault by
// migration and never seen by a human (see the migration), checked
// inside public.get_enabled_weather_sources_for_sync rather than via
// Supabase's own verify_jwt gateway check, since the caller here is
// Postgres itself, not a signed-in user.
//
// Loops every enabled source across every producer -- the one deliberate,
// explicit RLS bypass in this codebase -- and reuses the exact same
// fetch/validate/upsert logic ingest-weather already uses
// (_shared/weatherIngest.ts), so there is one definition of "how a
// Tempest reading gets validated and stored," not two that can drift.
// Each source gets up to a few bounded chunks per run (not just one),
// so a source with a stalled/interrupted backfill -- e.g. a producer
// closed the tab mid-backfill, which previously left it stuck until
// someone reopened the app -- also gradually catches up on its own.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/supabaseClient.ts";
import { syncWeatherSourceChunk, type WeatherSource } from "../_shared/weatherIngest.ts";

// Calibrated against two real runs: 12 chunks completed in well under 30
// seconds with no issue; 40 chunks crashed near the very end with a
// WORKER_RESOURCE_LIMIT error (memory, not wall-clock time -- Supabase's
// Edge Function runtime, not pg_net or Postgres). Each chunk still commits
// independently before the next starts, so the crash lost no data, just
// the last couple of chunks that invocation would have completed. 25
// stays with real margin below the observed ceiling. Chunks run
// sequentially, not concurrently, so raising this doesn't increase the
// request *rate* to Tempest (still unconfirmed -- see docs/decisions/0019's
// open items), only how much sequential work fits in one hourly
// invocation. At 5 days/chunk that's ~125 days of history per source per
// hour -- a full 5-year backfill finishes in under 15 hours instead of
// ~1.5 days at the previous cap of 12.
const MAX_CHUNKS_PER_SOURCE = 25;

type SourceWithKey = WeatherSource & { api_key: string };

Deno.serve(async (req: Request) => {
  const supabase = createAdminClient();
  const triggerSecret = req.headers.get("X-Cron-Secret") ?? "";

  // get_enabled_weather_sources_for_sync checks triggerSecret against
  // Vault itself and raises if it doesn't match -- vault.decrypted_secrets
  // isn't reachable via PostgREST directly (only public/graphql_public are
  // exposed per supabase/config.toml, the same reason the two Vault
  // helpers exist for the user-driven path), so the check and the fetch
  // happen together, server-side, in one SECURITY DEFINER call.
  const { data: sources, error } = await supabase.rpc("get_enabled_weather_sources_for_sync", {
    p_trigger_secret: triggerSecret,
  });

  if (error) {
    const unauthorized = error.message.includes("not authorized");
    return new Response(JSON.stringify({ error: error.message }), {
      status: unauthorized ? 401 : 500,
      headers: { "content-type": "application/json" },
    });
  }

  let synced = 0;
  const errors: Array<{ source_id: string; error: string }> = [];

  for (const source of (sources ?? []) as SourceWithKey[]) {
    try {
      // A mutable copy advanced with each chunk's real result -- passing
      // the original, never-updated `source` back in on every iteration
      // would recompute the same window each time and never progress
      // past the first chunk (see the comment on syncWeatherSourceChunk).
      let current: WeatherSource = source;
      let done = false;
      for (let i = 0; i < MAX_CHUNKS_PER_SOURCE && !done; i++) {
        const result = await syncWeatherSourceChunk(supabase, current, source.api_key);
        if (result.error) throw new Error(result.error);
        current = {
          ...current,
          backfill_status: result.backfill_status ?? current.backfill_status,
          backfill_cursor: result.backfill_cursor ?? current.backfill_cursor,
          last_synced_at: result.last_synced_at ?? current.last_synced_at,
        };
        done = result.done;
      }
      synced++;
    } catch (err) {
      errors.push({ source_id: source.id, error: String(err) });
    }
  }

  return new Response(JSON.stringify({ synced, errors }), {
    headers: { "content-type": "application/json" },
  });
});
