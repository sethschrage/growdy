// The one server-side piece in this project (docs/decisions/0016). Holds
// the Anthropic API key so it never reaches the client, and now also holds
// the only database credential that ever leaves the browser: the caller's
// own forwarded JWT, used to build a Supabase client scoped to exactly
// that producer's RLS session -- never the service role key. The chat
// writes and runs its own read-only SQL (via execute_readonly_query)
// instead of picking from a fixed menu of query shapes a hand-written
// resolver executes on its behalf (superseded 0010/0013/0015) -- one
// general capability instead of a new resolver per question shape, and
// one that can answer a question its designer never anticipated.
//
// Read-only is enforced by Postgres itself (a read-only transaction, plus
// Postgres' own grammar rejecting a data-modifying CTE nested this way),
// not by trusting the model or inspecting the query text -- see the
// migration that defines execute_readonly_query for the verified detail.
//
// Chat-based observation submission (0009, 0012, 0014) is removed: no
// draft/confirm flow, no pending-review workflow. The `observations`
// table itself is untouched and fully queryable like anything else --
// its rows are real field-note data, not something this removal affects.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-5";
const MAX_TOOL_ITERATIONS = 6;

const SCHEMA_TABLES = [
  "planting_readable",
  "position_status",
  "plant_types",
  "parcels",
  "plots",
  "plot_rows",
  "producers",
  "observations",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXECUTE_READONLY_QUERY_TOOL = {
  name: "execute_readonly_query",
  description:
    "Run a read-only SQL query (a single SELECT or WITH ... SELECT statement) against the vineyard database to answer the producer's question. Write whatever query actually answers it -- filter, group, join, and aggregate freely. One call is usually enough. Only call it again in the same turn if the first result genuinely doesn't answer the question, or a natural follow-up needs one more narrower query (like adding a status filter) instead of asking something you could just look up. As soon as you have enough to answer, stop calling this and write the answer.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A single SELECT or WITH ... SELECT statement." },
    },
    required: ["query"],
  },
};

function buildSystemPrompt(schema: string) {
  return `You are helping a vineyard producer explore and understand their field data by answering questions in plain conversational language.

You have direct, read-only SQL access to the database via the execute_readonly_query tool. Prefer planting_readable and position_status -- both already resolve foreign keys to readable names. planting_readable has variety/scion/rootstock/nickname columns for identifying a plant, and dead_date/removed_date/removed_reason for its status (alive = both null; dead = dead_date set, removed_date null; removed = removed_date set, regardless of dead_date). observations holds real field notes -- most linked to a specific planting via planting_id, some standing on their own with no location at all.

A misspelling won't match a plain substring search. similarity(column, 'term') > 0.3 (pg_trgm) tolerates typos when an exact ilike search finds nothing.

Answer in plain conversational language, matching the level of detail to how the question was actually phrased -- a quick total for "how many," a fuller breakdown for "where." Don't just restate a raw number if the data supports a more useful answer, and proactively mention anything notable you notice in the results, even if it wasn't explicitly asked about.

Current schema:
${schema}`;
}

async function callAnthropic(conversation: unknown[], systemPrompt: string, includeTools = true) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      ...(includeTools ? { tools: [EXECUTE_READONLY_QUERY_TOOL] } : {}),
      messages: conversation,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${message}`);
  }

  return response.json();
}

async function fetchSchemaDescription(supabase: SupabaseClient) {
  const query = `select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = any(array[${SCHEMA_TABLES.map((t) => `'${t}'`).join(",")}])
    order by table_name, ordinal_position`;

  const { data, error } = await supabase.rpc("execute_readonly_query", { query });
  if (error) throw new Error(`Schema lookup failed: ${error.message}`);

  const byTable = new Map<string, string[]>();
  for (const row of (data ?? []) as { table_name: string; column_name: string; data_type: string }[]) {
    const columns = byTable.get(row.table_name) ?? [];
    columns.push(`${row.column_name} (${row.data_type})`);
    byTable.set(row.table_name, columns);
  }

  return [...byTable.entries()].map(([table, columns]) => `${table}: ${columns.join(", ")}`).join("\n");
}

async function runAgentLoop(conversation: unknown[], supabase: SupabaseClient, systemPrompt: string) {
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await callAnthropic(conversation, systemPrompt);
    const toolUses = (data.content ?? []).filter((block: { type: string }) => block.type === "tool_use");

    if (toolUses.length === 0) {
      const text = (data.content ?? []).find((block: { type: string }) => block.type === "text")?.text ?? "";
      return { type: "text", text };
    }

    conversation.push({ role: "assistant", content: data.content });

    const toolResults = await Promise.all(
      toolUses.map(async (toolUse: { id: string; input: { query: string } }) => {
        console.log(`chat tool call (iteration ${i + 1}): ${toolUse.input.query}`);
        const { data: rows, error } = await supabase.rpc("execute_readonly_query", {
          query: toolUse.input.query,
        });
        if (error) console.error(`chat tool call failed: ${error.message}`);
        return {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: error ? JSON.stringify({ error: error.message }) : JSON.stringify(rows ?? []),
          is_error: Boolean(error),
        };
      }),
    );

    conversation.push({ role: "user", content: toolResults });
  }

  // Ran out of iterations without a final answer -- ask once more without
  // the tool available, forcing a text reply that summarizes whatever was
  // already found, instead of a hard failure with nothing to show for it.
  console.error(`chat hit MAX_TOOL_ITERATIONS (${MAX_TOOL_ITERATIONS}) without a final answer`);
  const finalData = await callAnthropic(conversation, systemPrompt, false);
  const finalText = (finalData.content ?? []).find((block: { type: string }) => block.type === "text")?.text ?? "";
  return {
    type: "text",
    text: finalText || "That took more searching than expected -- try asking a narrower question.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    // Never construct a client with a secret/service-role key here --
    // forwarding the caller's own JWT is what keeps every query RLS-scoped
    // to exactly the signed-in producer, the same as if the browser ran it
    // directly. The publishable key (same key family the app itself uses
    // client-side) only sets the apikey header; it grants nothing on its
    // own without a valid Authorization.
    const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)["default"];
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      publishableKey,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const schema = await fetchSchemaDescription(supabase);
    const systemPrompt = buildSystemPrompt(schema);
    const result = await runAgentLoop([...messages], supabase, systemPrompt);

    return new Response(JSON.stringify(result), {
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
