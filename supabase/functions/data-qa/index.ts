// The read-only counterpart to observation-chat (docs/decisions/0010):
// holds the Anthropic API key so it never reaches the client. Its job
// is narrow on purpose -- extract which question is being asked and
// hand back a structured description of it. It never touches the
// database itself, and has no tool that could lead to a write; the
// app resolves the described query against planting_readable or
// position_status under the signed-in user's own RLS-scoped session.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are helping a vineyard producer ask a question about their own field data -- what's planted where, or which positions are currently blocked, open, or planted.

There are two kinds of questions you can help with:
- A planting lookup: what's planted at a specific plot, row, and position.
- A position status question: which positions in a specific plot and row are blocked, open, or planted (optionally filtered to just one of those statuses).

Ask only ONE clarifying question at a time, in plain conversational language, and only for whatever's actually missing. Never ask for something already given.

Once you have enough to look something up, call the describe_query tool. Do not call it before a planting lookup has plot, row_number, and position, or before a position status question has at least plot and row_number.`;

const TOOL = {
  name: "describe_query",
  description:
    "Describe the data question being asked so the app can look it up. Never used to look up anything yourself -- only to describe what should be looked up.",
  input_schema: {
    type: "object",
    properties: {
      query_type: {
        type: "string",
        enum: ["planting_lookup", "position_status"],
      },
      plot: { type: "string" },
      row_number: { type: "integer" },
      position: {
        type: "integer",
        description: "Only for planting_lookup",
      },
      status: {
        type: "string",
        enum: ["planted", "blocked", "open"],
        description: "Only for position_status, if a specific status was asked about",
      },
    },
    required: ["query_type", "plot", "row_number"],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        messages,
      }),
    });

    if (!anthropicResponse.ok) {
      const message = await anthropicResponse.text();
      console.error(`Anthropic API error (${anthropicResponse.status}): ${message}`);
      return new Response(JSON.stringify({ type: "error", message }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const data = await anthropicResponse.json();
    const toolUse = data.content?.find((block: { type: string }) => block.type === "tool_use");

    if (toolUse) {
      return new Response(JSON.stringify({ type: "ready", ...toolUse.input }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const text =
      data.content?.find((block: { type: string }) => block.type === "text")?.text ?? "";

    return new Response(JSON.stringify({ type: "question", text }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error(`data-qa crashed: ${err}`);
    return new Response(JSON.stringify({ type: "error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
