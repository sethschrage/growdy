import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

// Builds a Postgres client scoped to exactly the calling user's own RLS
// session -- forwards the caller's own JWT, never a secret/service-role
// key, so every query made through the returned client is scoped exactly
// as if the browser had made it directly. Shared by every Edge Function
// that acts on a signed-in user's own behalf (chat, ingest-weather) --
// there should be exactly one definition of this, not one per function
// that can silently drift apart (see docs/decisions/0019).
export function createUserScopedClient(req: Request): SupabaseClient {
  const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)["default"];
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    publishableKey,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
}

// Builds a Postgres client authenticated as service_role -- bypasses RLS
// entirely, scoped to no one user. This is real elevated privilege, not a
// convenience: call it only from a scheduled job with an actual reason to
// see every producer's rows at once (sync-scheduled-weather/0020,
// scan-conversations-for-observations/0025 follow-up,
// embed-scheduled-memory/0023) -- never from anything a browser can trigger.
export function createAdminClient(): SupabaseClient {
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(Deno.env.get("SUPABASE_URL")!, secretKey);
}

// Which producer the caller is, or null if the request doesn't resolve to
// one. This is the self-authorization half of `verify_jwt: false`: the
// gateway is deliberately not checking a JWT for the functions a browser
// calls (_shared/cors.ts, 0020), so each of them has to resolve its own
// caller before doing any work. `chat` did not, from the day it shipped
// until 2026-09-21 -- a POST carrying no Authorization header and no
// apikey reached the Anthropic API and was billed to this project's key.
// RLS is why it went unnoticed rather than why it was safe: every query
// the request made came back empty and the model answered anyway.
//
// `profiles` is the right thing to ask, because it is the tenancy key --
// app/src/data/profile.ts says the same thing on the client side. There
// is no `.eq("id", ...)` because there is nothing to compare against yet:
// the policy is `id = auth.uid()`, so the row this returns is already the
// caller's own and can't be anyone else's, and `anon` holds no grant on
// the table at all, so a request with no usable JWT gets a permission
// error rather than an empty result. Both arrive here as null.
//
// A signed-in account with no profile row is a real state (0026,
// NoProducerScreen) and already a dead end in the client, so refusing it
// here costs a producer nothing -- and it matches what the database
// itself does in create_observation_candidate ("No producer for this
// user").
export async function resolveProducerId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("producer_id").maybeSingle();
  if (error) {
    // Not necessarily an attack: an expired token looks like this too.
    // Logged rather than returned, because the caller gets one answer
    // either way and the difference is only useful from this side.
    console.error(`producer lookup failed, refusing the request: ${error.message}`);
    return null;
  }
  return data?.producer_id ?? null;
}

// One 401 for every function that does the check above, with CORS headers
// on it -- a refusal the browser can't read is a refusal the producer
// sees as a network failure. `error` rather than `message` because that
// is the key both client-side unpackers already look for first
// (app/src/data/chat.ts's failureMessage, app/src/data/dataSources.ts's
// addWeatherSource).
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Not signed in, or this account has no producer." }),
    { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}
