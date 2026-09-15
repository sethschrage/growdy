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
