// Runs every 6 hours (see the migration that schedules it) -- the same
// Vault-secret-handshake shape sync-scheduled-weather (0020) and
// scan-conversations-for-observations (0025 follow-up) already
// established. Embeds whatever hasn't been embedded yet across both of
// producer memory's corpora (docs/decisions/0023): manually- or
// model-written producer_memory entries, and conversations whose
// transcript has changed since it was last chunked into
// conversation_embeddings. Never called from a browser, no CORS
// handling, no forwarded user JWT -- service_role only, the same narrow
// exception every other scheduled job in this project already is.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/supabaseClient.ts";
import { embedTexts, toVectorLiteral } from "../_shared/voyage.ts";

const MAX_ITEMS_PER_RUN = 20;

type PendingMemoryEntry = { id: string; content: string };
type PendingConversation = { id: string; producer_id: string; transcript: { role: string; content: string }[] };

// One chunk per message, formatted as "role: content" so a chunk reads
// sensibly on its own even without the rest of the conversation around
// it -- matches how scan-conversations-for-observations already formats
// transcript content for the model. Empty/trivial messages are skipped
// rather than embedded as noise.
function chunkTranscript(transcript: { role: string; content: string }[]): string[] {
  return transcript
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => `${m.role}: ${m.content.trim()}`);
}

async function embedPendingMemoryEntries(supabase: ReturnType<typeof createAdminClient>, triggerSecret: string) {
  const { data: entries, error } = await supabase.rpc("get_pending_memory_entries", {
    p_trigger_secret: triggerSecret,
    p_limit: MAX_ITEMS_PER_RUN,
  });
  if (error) throw new Error(`get_pending_memory_entries failed: ${error.message}`);

  const pending = (entries ?? []) as PendingMemoryEntry[];
  let embedded = 0;
  const errors: string[] = [];

  if (pending.length === 0) return { embedded, errors };

  try {
    const vectors = await embedTexts(
      pending.map((e) => e.content),
      "document",
    );
    for (let i = 0; i < pending.length; i++) {
      const { error: setError } = await supabase.rpc("set_memory_embedding", {
        p_trigger_secret: triggerSecret,
        p_id: pending[i].id,
        p_embedding: toVectorLiteral(vectors[i]),
      });
      if (setError) throw new Error(setError.message);
      embedded++;
    }
  } catch (err) {
    console.error(`failed to embed memory entries: ${err}`);
    errors.push(String(err));
  }

  return { embedded, errors };
}

async function embedPendingConversations(supabase: ReturnType<typeof createAdminClient>, triggerSecret: string) {
  const { data: conversations, error } = await supabase.rpc("get_conversations_for_memory_embedding", {
    p_trigger_secret: triggerSecret,
    p_limit: MAX_ITEMS_PER_RUN,
  });
  if (error) throw new Error(`get_conversations_for_memory_embedding failed: ${error.message}`);

  let embedded = 0;
  const errors: string[] = [];

  for (const conversation of (conversations ?? []) as PendingConversation[]) {
    try {
      const chunks = chunkTranscript(conversation.transcript ?? []);
      if (chunks.length === 0) {
        // Nothing to embed, but still mark it seen so it doesn't get
        // reconsidered every run -- a direct update, not
        // replace_conversation_embeddings, since that function's chunk
        // loop isn't meant to handle an empty array.
        const { error: markError } = await supabase
          .from("conversations")
          .update({ embedded_at: new Date().toISOString() })
          .eq("id", conversation.id);
        if (markError) throw new Error(markError.message);
        continue;
      }

      const vectors = await embedTexts(chunks, "document");
      const { error: replaceError } = await supabase.rpc("replace_conversation_embeddings", {
        p_trigger_secret: triggerSecret,
        p_conversation_id: conversation.id,
        p_producer_id: conversation.producer_id,
        p_chunks: chunks,
        p_embeddings: vectors.map(toVectorLiteral),
      });
      if (replaceError) throw new Error(replaceError.message);
      embedded++;
    } catch (err) {
      console.error(`failed to embed conversation ${conversation.id}: ${err}`);
      errors.push(`${conversation.id}: ${err}`);
    }
  }

  return { embedded, errors };
}

Deno.serve(async (req: Request) => {
  const supabase = createAdminClient();
  const triggerSecret = req.headers.get("X-Cron-Secret") ?? "";

  try {
    const [memoryResult, conversationResult] = await Promise.all([
      embedPendingMemoryEntries(supabase, triggerSecret),
      embedPendingConversations(supabase, triggerSecret),
    ]);

    return new Response(
      JSON.stringify({
        embeddedMemoryEntries: memoryResult.embedded,
        embeddedConversations: conversationResult.embedded,
        errors: [...memoryResult.errors, ...conversationResult.errors],
      }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    console.error(`embed-scheduled-memory failed: ${err}`);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
});
