// Run with: deno test supabase/functions/_shared/supabaseClient.test.ts
//
// These cover the only access control the browser-facing functions have.
//
// verify_jwt is deliberately false on all six functions so they can answer
// their own CORS preflight (cors.ts, 0020), which means the Supabase
// gateway checks nothing at all. resolveProducerId is what replaced it,
// and until #238 there was no replacement: chat answered OPTIONS and then
// went straight to building a prompt and calling Anthropic, so a POST with
// no Authorization header and no apikey reached the model on this
// project's key and came back with a real Anthropic request id.
//
// So the property being pinned here is not "it returns a producer". It is
// that every path which is not a known-good row returns null, because the
// caller turns null into a 401 and anything else into a billed API call.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { resolveProducerId, unauthorizedResponse } from "./supabaseClient.ts";
import { corsHeaders } from "./cors.ts";

/**
 * The narrow slice of the client this function touches:
 * `supabase.from(...).select(...).maybeSingle()`.
 *
 * Hand-written rather than mocked from the real type, so that a change to
 * the chain shape breaks a test here instead of silently passing.
 */
// deno-lint-ignore no-explicit-any
function stubClient(result: { data?: unknown; error?: { message: string } }): any {
  const calls: string[] = [];
  const chain = {
    select: (cols: string) => {
      calls.push(`select:${cols}`);
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null, ...result }),
  };
  return {
    calls,
    from: (table: string) => {
      calls.push(`from:${table}`);
      return chain;
    },
  };
}

Deno.test("a permission error refuses the request", async () => {
  // What a caller with no usable JWT actually gets: anon holds no grant
  // on profiles, so this is a permission error rather than an empty
  // result. Both have to end in null.
  const client = stubClient({ error: { message: "permission denied for table profiles" } });
  assertEquals(await resolveProducerId(client), null);
});

Deno.test("an empty result refuses the request", async () => {
  // A signed-in account with no profile row is a real state (0026,
  // NoProducerScreen) and already a dead end in the client.
  assertEquals(await resolveProducerId(stubClient({ data: null })), null);
});

Deno.test("a row whose producer_id is null refuses the request", async () => {
  // ?? null rather than a truthiness check, so this stays refused.
  assertEquals(await resolveProducerId(stubClient({ data: { producer_id: null } })), null);
});

Deno.test("a good row resolves to that producer", async () => {
  const id = "8f1d5c2e-0000-4000-8000-000000000001";
  assertEquals(await resolveProducerId(stubClient({ data: { producer_id: id } })), id);
});

Deno.test("it asks profiles for producer_id, and nothing wider", async () => {
  // profiles is the tenancy key and its policy is id = auth.uid(), so the
  // row this returns is already the caller's own. If the table or the
  // column ever changes, the guard is reading something whose policy may
  // not be that -- which is worth failing a test over.
  const client = stubClient({ data: { producer_id: "x" } });
  await resolveProducerId(client);
  assertEquals(client.calls, ["from:profiles", "select:producer_id"]);
});

Deno.test("the refusal is a 401", () => {
  assertEquals(unauthorizedResponse().status, 401);
});

Deno.test("the refusal carries CORS headers", () => {
  // This is the one that hid the original bug's shape: a refusal a
  // browser cannot read is not a refusal to the producer, it is a
  // network failure with no explanation -- the same thing `Load failed`
  // was in 0037.
  const headers = unauthorizedResponse().headers;
  for (const [key, value] of Object.entries(corsHeaders)) {
    assertEquals(headers.get(key), value, `missing ${key}`);
  }
});

Deno.test("the refusal uses the key the clients already unpack", async () => {
  // app/src/data/chat.ts's failureMessage and dataSources.ts's
  // addWeatherSource both look for `error` first. A refusal under any
  // other key reaches the producer as an empty message.
  const body = await unauthorizedResponse().json();
  assertStringIncludes(body.error, "Not signed in");
});
