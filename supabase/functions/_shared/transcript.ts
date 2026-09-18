// A transcript message's `content` is a string today -- all 216 stored
// messages are, checked directly -- but the Anthropic Messages API uses
// an array of content blocks the moment an image is attached, and photo
// attachment in chat is being built (0030). Every consumer of a
// transcript assumed the string, each in its own way and each failing
// differently and quietly: `.trim()` on an array throws, and template
// interpolation yields "[object Object]", which looks like input.
//
// The tempting fix -- stringify the array -- is the expensive one. A
// 12MP photo is roughly 1.5-4MB of base64, on the order of 500K-1M
// tokens, and a couple of hundred of them would exhaust Voyage's 200M
// free grant on embeddings of base64, which carries no meaning to embed.
// So text blocks are extracted and non-text blocks are dropped here, in
// one place, rather than each caller inventing its own answer.

export type ContentBlock = { type: string; text?: string };
export type TranscriptMessage = { role: string; content: string | ContentBlock[] };

export function messageText(message: TranscriptMessage): string {
  const { content } = message;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text!.trim())
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}
