import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

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
