// Shared by every Edge Function that handles its own CORS/OPTIONS
// preflight (chat, ingest-weather) -- both need verify_jwt: false at
// deploy time for the same reason: Supabase's gateway-level JWT check
// can't be selectively exempted for the preflight-only case, so each
// function answers OPTIONS itself instead.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // `accept` is here because the chat function chooses between a
  // streamed and a buffered reply from it. A non-safelisted value like
  // text/event-stream makes the browser preflight, and a preflight that
  // doesn't list the header fails the request before it is sent -- which
  // looks exactly like the function being down.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
};
