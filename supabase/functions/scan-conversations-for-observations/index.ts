// A real answer to docs/vision.md's still-open "how does new data get in
// now that chat can't submit it" question -- not a new submission path,
// recovering what's already sitting in past conversations. Invoked every
// 6 hours by pg_cron (see the migration that schedules it) the same
// Vault-secret-handshake shape sync-scheduled-weather (0020) already
// established; never called from a browser, no CORS handling, no
// forwarded user JWT.
//
// Loops every producer's due-for-scan conversations at once -- the same
// deliberate, narrow service_role exception 0020 already named, not a new
// class of risk -- classifies each with Claude, and only creates a
// candidate row when it actually looks like a field observation. Nothing
// ever lands in `observations` from here directly; a producer has to
// confirm each candidate themselves.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/supabaseClient.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-5";

// Bounds one run's worst-case cost/runtime the same way
// MAX_CHUNKS_PER_SOURCE bounds sync-scheduled-weather's -- matches the
// default limit already baked into get_conversations_for_observation_scan.
const MAX_CONVERSATIONS_PER_RUN = 20;

const CLASSIFY_TOOL = {
  name: "classify_conversation",
  description: "Classify whether this conversation describes a real field observation about the vineyard -- something the producer saw, did, or noted, not just a question they asked.",
  input_schema: {
    type: "object",
    properties: {
      is_observation: {
        type: "boolean",
        description: "True only if the producer described something they observed, did, or noted about the vineyard -- not a question, not small talk.",
      },
      summary: {
        type: "string",
        description: "A one-sentence field-note-style summary, written the way the producer would phrase it in their own log. Empty string if is_observation is false.",
      },
    },
    required: ["is_observation", "summary"],
  },
};

type ClassifyResult = { is_observation: boolean; summary: string };

async function classifyConversation(transcript: { role: string; content: string }[]): Promise<ClassifyResult> {
  const conversationText = transcript.map((m) => `${m.role}: ${m.content}`).join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: "You are reviewing a past chat transcript between a vineyard producer and an assistant, looking for real field observations worth recovering into the producer's permanent record -- something seen, done, or noted about the vineyard, not a question asked about existing data.",
      messages: [{ role: "user", content: `Transcript:\n\n${conversationText}` }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_conversation" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const toolUse = (data.content ?? []).find((block: { type: string }) => block.type === "tool_use");
  if (!toolUse) throw new Error("classify_conversation was not called");
  return toolUse.input as ClassifyResult;
}

Deno.serve(async (req: Request) => {
  const supabase = createAdminClient();
  const triggerSecret = req.headers.get("X-Cron-Secret") ?? "";

  const { data: conversations, error } = await supabase.rpc("get_conversations_for_observation_scan", {
    p_trigger_secret: triggerSecret,
    p_limit: MAX_CONVERSATIONS_PER_RUN,
  });

  if (error) {
    console.error(`get_conversations_for_observation_scan failed: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 401 });
  }

  let scanned = 0;
  let candidatesCreated = 0;
  const errors: string[] = [];

  for (const conversation of conversations ?? []) {
    try {
      const transcript = (conversation.transcript ?? []) as { role: string; content: string }[];
      if (transcript.length > 0) {
        const result = await classifyConversation(transcript);
        if (result.is_observation && result.summary.trim()) {
          const { error: insertError } = await supabase.from("observation_candidates").insert({
            conversation_id: conversation.id,
            producer_id: conversation.producer_id,
            summary: result.summary.trim(),
          });
          if (insertError) throw new Error(insertError.message);
          candidatesCreated++;
        }
      }

      const { error: updateError } = await supabase
        .from("conversations")
        .update({ scanned_at: new Date().toISOString() })
        .eq("id", conversation.id);
      if (updateError) throw new Error(updateError.message);

      scanned++;
    } catch (err) {
      console.error(`failed to scan conversation ${conversation.id}: ${err}`);
      errors.push(`${conversation.id}: ${err}`);
    }
  }

  return new Response(JSON.stringify({ scanned, candidatesCreated, errors }), {
    headers: { "content-type": "application/json" },
  });
});
