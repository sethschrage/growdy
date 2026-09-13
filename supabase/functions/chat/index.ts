// The one server-side piece in this project (docs/decisions/0009, 0010,
// 0012): holds the Anthropic API key so it never reaches the client. Its
// job is narrow on purpose -- figure out what's being asked or logged,
// and hand back a structured description of it. It never touches the
// database itself; the app resolves a describe_query intent against
// planting_readable or position_status, or a submit_observation_draft
// intent against a planting match the app looks up itself, both under
// the signed-in user's own RLS-scoped session.
//
// Two tools live in one list here rather than in separate functions
// (0012): the actual safety backstop was never which function could
// reach which tool -- it's the client's confirm-before-write step and
// the database's insert policy requiring status = 'pending' (0009),
// neither of which changes here. Every response names which tool fired
// (`tool`) so the client can tell a query intent from a submission
// draft without needing two endpoints to infer it from.
//
// For describe_query, the client resolves the data and sends it back
// here as a tool_result on the same conversation (assistant_content and
// tool_use_id round-trip for exactly that), so the reply the producer
// reads is the model's own composed text over real data -- not a canned
// string template that can't adapt to how the question was phrased.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are helping a vineyard producer with their field data -- answering questions about what's planted where, and logging new observations about specific plants.

There are five things you can help with:
- A variety lookup: where a given variety, scion, rootstock, or nickname is planted, searched across every parcel -- for questions like "where is my Gamay" or "how much Gamay do I have," not narrowed to any one parcel.
- A parcel lookup: what's planted anywhere within a whole parcel, not narrowed to one row or position.
- A planting lookup: what's planted at a specific plot, row, and position.
- A position status question: which positions in a specific plot and row are blocked, open, or planted (optionally filtered to just one of those statuses).
- Logging an observation: recording something about a specific plant at a specific plot, row, and position.

Figure out which one is meant from context. Someone describing something they noticed, did, or want recorded about a plant ("I trimmed...", "this vine looks...", "saw some mildew on...") is logging an observation, not asking a question. Someone asking what's planted, where, or the status of positions is one of the four lookup types.

If someone answers a parcel question with "everywhere," "anywhere," "all of them," or similar, that means they want a variety lookup, not a parcel lookup -- don't ask which parcel again.

Ask only ONE clarifying question at a time, in plain conversational language, and only for whatever's actually missing. Never ask for something already given. For an observation, if the person genuinely doesn't know an exact plot/row/position, don't guess at a value -- keep asking for whatever identifying detail they do have until you have all three or they say they truly can't tell you more, in which case say you're not able to log this without at least the plot, row, and position.

Once you have enough, call the matching tool. Do not call describe_query before a variety lookup has a variety, a parcel lookup has a parcel, a planting lookup has plot, row_number, and position, or a position status question has at least plot and row_number. Do not call submit_observation_draft before plot, row_number, position, and a note are all known.

After a describe_query call, you'll get the matching data back. Answer in plain conversational language using it -- match the level of detail to how the question was actually phrased (a quick total for "how many," a fuller breakdown by parcel or plot for "where," specific varieties or nicknames if the data has them and the question invites it). Don't just restate a raw count if the data supports a more useful answer.`;

const DESCRIBE_QUERY_TOOL = {
  name: "describe_query",
  description:
    "Describe the data question being asked so the app can look it up. Never used to look up anything yourself -- only to describe what should be looked up.",
  input_schema: {
    type: "object",
    properties: {
      query_type: {
        type: "string",
        enum: ["variety_lookup", "parcel_lookup", "planting_lookup", "position_status"],
      },
      variety: {
        type: "string",
        description: "Required for variety_lookup. The variety, scion, rootstock, or nickname to search for across every parcel. Not used otherwise.",
      },
      parcel: {
        type: "string",
        description: "Required for parcel_lookup. Not used otherwise.",
      },
      plot: {
        type: "string",
        description: "Required for planting_lookup and position_status. Not used for parcel_lookup.",
      },
      row_number: {
        type: "integer",
        description: "Required for planting_lookup and position_status. Not used for parcel_lookup.",
      },
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
    required: ["query_type"],
  },
};

const SUBMIT_OBSERVATION_DRAFT_TOOL = {
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
        tools: [DESCRIBE_QUERY_TOOL, SUBMIT_OBSERVATION_DRAFT_TOOL],
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
      return new Response(
        JSON.stringify({
          type: "ready",
          tool: toolUse.name,
          tool_use_id: toolUse.id,
          assistant_content: data.content,
          ...toolUse.input,
        }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const text =
      data.content?.find((block: { type: string }) => block.type === "text")?.text ?? "";

    return new Response(JSON.stringify({ type: "question", text }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error(`chat crashed: ${err}`);
    return new Response(JSON.stringify({ type: "error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
