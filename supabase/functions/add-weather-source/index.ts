// Adds a weather data_source on behalf of the signed-in producer, through
// their own forwarded JWT -- same auth pattern as chat/ingest-weather, no
// service_role. A producer supplies the station ID they actually see in
// Tempest's own app/URL (e.g. tempestwx.com/station/175413), not Tempest's
// internal device ID the observations endpoint actually requires -- this
// function resolves that translation server-side (resolveTempestDeviceId
// in _shared/weatherIngest.ts) before calling private.add_data_source,
// so self-serve sign-up never asks a producer for an ID they have no way
// to see. Tempest is the only provider today; a second provider would
// need its own resolution branch here, or none if its own external id
// needs no translation.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createUserScopedClient } from "../_shared/supabaseClient.ts";
import { resolveTempestDeviceId } from "../_shared/weatherIngest.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider_id, name, station_id, secret } = await req.json();
    const supabase = createUserScopedClient(req);

    const deviceId = await resolveTempestDeviceId(station_id, secret);

    const { data, error } = await supabase.rpc("add_data_source", {
      p_provider_id: provider_id,
      p_name: name,
      p_external_id: deviceId,
      p_secret: secret,
    });

    if (error) {
      throw new Error(error.message);
    }

    return new Response(JSON.stringify({ id: data }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
