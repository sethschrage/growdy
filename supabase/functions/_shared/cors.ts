// Shared by every Edge Function a browser calls (chat, ingest-weather,
// add-weather-source) -- all three need verify_jwt: false at deploy time
// for the same reason: Supabase's gateway-level JWT check can't be
// selectively exempted for the preflight-only case, so each function
// answers OPTIONS itself instead.
//
// The half of that sentence that is easy to skip: with the gateway check
// off, nothing upstream of the handler is checking anything, so each of
// these three has to resolve its own caller before it does any work.
// `resolveProducerId` in ./supabaseClient.ts is that step, and it is not
// optional -- `chat` shipped without it and answered anonymous POSTs on
// this project's Anthropic key until 2026-09-21.
//
// Worth knowing before reading the above as a property of these three:
// ALL SIX functions deploy with verify_jwt: false, for two unrelated
// reasons. These three because of the preflight; the three `pg_cron`
// fires (sync-scheduled-weather, scan-conversations-for-observations,
// embed-scheduled-memory) because the caller is Postgres rather than a
// signed-in user, and they authorize themselves against a Vault-stored
// X-Cron-Secret instead (0020). So "this function has no gateway check"
// is true of every function in this project, and which self-check it
// runs is the only thing that differs.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // `accept` is here because the chat function chooses between a
  // streamed and a buffered reply from it. A non-safelisted value like
  // text/event-stream makes the browser preflight, and a preflight that
  // doesn't list the header fails the request before it is sent -- which
  // looks exactly like the function being down.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
};
