// Voyage AI, now offered as "Voyage AI by MongoDB" since MongoDB's 2024
// acquisition -- the endpoint and auth are MongoDB's, the models and
// request/response shape are still Voyage's own (see
// docs/decisions/0023). Confirmed directly against MongoDB's own current
// docs before writing this, not assumed from Voyage's original
// standalone API docs, since the two are no longer guaranteed identical
// post-acquisition.
//
// output_dimension is always specified explicitly, never left to an
// implicit default -- every vector column in this project is
// extensions.vector(1024); a model or request that silently changed its
// default dimension would break every existing embedding without
// anyone noticing until a similarity search started erroring.

const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY")!;
const VOYAGE_ENDPOINT = "https://ai.mongodb.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-4-lite";
const EMBEDDING_DIMENSION = 1024;

type VoyageInputType = "query" | "document";

// input_type shapes how the model reads the text (a search query vs. a
// document being indexed) -- MongoDB's own docs say plainly not to omit
// it for retrieval use cases, so every call here is explicit about which
// one it is rather than leaving it unset.
export async function embedTexts(texts: string[], inputType: VoyageInputType): Promise<number[][]> {
  const response = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSION,
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage embeddings API error (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return (data.data as { embedding: number[] }[]).map((item) => item.embedding);
}

// pgvector's text input format is a bracketed, comma-separated list --
// this is the only place that format needs to be produced, so every
// caller passes a plain number[] and never constructs the string itself.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
