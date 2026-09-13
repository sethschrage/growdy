// The one server-side piece in this project (docs/decisions/0009): holds
// the Anthropic API key so it never reaches the client. Its job is
// narrow on purpose -- gather a plot/row/position and a note through
// conversation, then hand back a draft for the app to resolve and
// insert. It never touches the database itself; verify_jwt (set at
// deploy time) already ensures only a signed-in user can call it at
// all.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are helping a vineyard field worker log an observation about a specific plant.

Gather exactly these fields through conversation, one question at a time:
- plot: the plot name (e.g. "North" or "South")
- row_number: the row number within that plot
- position: the position number within that row
- note: what they want to record about the plant
- observed_date: when this happened, if mentioned (ISO date, otherwise leave out)

Ask only ONE clarifying question at a time, in plain conversational language. Never ask for something already given. If the person genuinely doesn't know an exact plot/row/position, don't guess at a value -- keep asking for whatever identifying detail they do have until you have all three or they say they truly can't tell you more, in which case say you're not able to log this without at least the plot, row, and position.

Once you have plot, row_number, position, and a note, call the submit_observation_draft tool with those fields. Do not call it before all three of plot, row_number, and position are known.`;

const TOOL = {
  name: "submit_observation_draft",
  description:
    "Submit the gathered observation details once plot, row_number, position, and note are known.",
  input_schema: {
    type: "object",
    properties: {
      plot: { type: "string" },
      row_number: { type: "integer" },
      position: { type: "integer" },
      note: { type: "string" },
      observed_date: {
        type: "string",
        description: "ISO date (YYYY-MM-DD), only if mentioned",
      },
    },
    required: ["plot", "row_number", "position", "note"],
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
    console.error(`observation-chat crashed: ${err}`);
    return new Response(JSON.stringify({ type: "error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
