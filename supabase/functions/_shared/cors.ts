// Shared by every Edge Function that handles its own CORS/OPTIONS
// preflight (chat, ingest-weather) -- both need verify_jwt: false at
// deploy time for the same reason: Supabase's gateway-level JWT check
// can't be selectively exempted for the preflight-only case, so each
// function answers OPTIONS itself instead.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
