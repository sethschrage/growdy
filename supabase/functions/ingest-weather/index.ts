// Pulls historical and new Tempest weather station readings into
// public.weather_observations, on behalf of the signed-in producer who
// owns the data_source being synced. Runs through the caller's own
// forwarded JWT the whole way through -- no service_role, ever (see
// docs/decisions/0019). Invoked from the browser (adding a source,
// opening the sources screen, a manual "Sync now"), and also (as of
// docs/decisions/0020) on an hourly schedule via sync-scheduled-weather,
// which calls the same underlying syncWeatherSourceChunk in
// _shared/weatherIngest.ts rather than this handler -- this file stays
// the single-source, user-JWT-scoped entry point.
//
// Backfill walks backward in Tempest's own resolution-cap-sized chunks
// (5 days) from "now" (or wherever it last got to) toward
// data_sources.backfill_start, one bounded chunk per invocation. The
// caller is expected to invoke again while the response's `done` is false.
//
// data_sources.external_id is the device ID Tempest's observations
// endpoint actually requires, not the station ID a producer sees in the
// Tempest app/URL -- the station->device lookup endpoint couldn't be
// confirmed from public docs (see docs/decisions/0019's open items), so
// v1 asks for the device ID directly rather than guess at an unverified
// resolution step.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createUserScopedClient,
  resolveProducerId,
  unauthorizedResponse,
} from "../_shared/supabaseClient.ts";
import { syncWeatherSourceChunk } from "../_shared/weatherIngest.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // verify_jwt: false here too, so the caller gets resolved before
    // anything else happens. This function already failed closed for an
    // anonymous caller -- the data_sources read below is RLS-scoped and
    // returns nothing, so the Tempest call was never reached -- but that
    // is the function declining to be useful, not a control, which is
    // the same distinction 20260921040000 drew about a PUBLIC grant.
    const supabase = createUserScopedClient(req);
    const producerId = await resolveProducerId(supabase);
    if (!producerId) return unauthorizedResponse();

    const { source_id } = await req.json();

    // RLS already scopes this to the caller's own source -- selecting
    // producer_id here (rather than a separate profiles lookup) is enough
    // to satisfy weather_observations' own RLS check on insert below.
    const { data: source, error: sourceError } = await supabase
      .from("data_sources")
      .select("id, producer_id, external_id, backfill_status, backfill_cursor, backfill_start, last_synced_at")
      .eq("id", source_id)
      .single();

    if (sourceError || !source) {
      throw new Error(`source not found or not accessible: ${sourceError?.message ?? "no such source"}`);
    }

    const { data: apiKey, error: secretError } = await supabase.rpc("get_decrypted_source_secret", {
      p_source_id: source_id,
    });
    if (secretError || !apiKey) {
      throw new Error(`could not retrieve credential: ${secretError?.message ?? "no secret set"}`);
    }

    const result = await syncWeatherSourceChunk(supabase, source, apiKey);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error(`ingest-weather crashed: ${err}`);
    return new Response(JSON.stringify({ done: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
