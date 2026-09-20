import type { ThinkingState } from '@/features/chat/thinking'

// What an answer cost, in money rather than in tokens.
//
// The producer has asked twice now whether a token count can possibly be
// right: "it took 90,000 tokens. really?", and later "weather did good
// but 35,000 tokens 16k cached". Both numbers were honest and neither
// was answerable, because most of a request this shape is the same
// prompt read back out of the cache at a tenth of the input price. On
// screen 135,504 cached tokens and 9,285 fresh ones look like the same
// kind of thing, and they differ by a factor of ten in what they cost.
//
// So the tokens stay -- they are what one answer gets compared against
// the last one with -- and the number a producer can actually act on
// goes next to them.

/**
 * claude-sonnet-5's published rates, in US dollars per million tokens.
 * The model is chosen by MODEL in supabase/functions/chat/index.ts, and
 * changing it there means changing these. A rate left behind after a
 * model swap is worse than showing nothing at all, because a wrong price
 * still looks like an answer and nobody goes back to check it.
 */
const USD_PER_MILLION_INPUT = 2
const USD_PER_MILLION_OUTPUT = 10

/**
 * Cached input is not billed at the input rate, which is the entire
 * reason the token count reads as alarming and the bill does not. A read
 * is about a tenth of a fresh input token; a write is about 1.25x it,
 * because the prompt has to be processed once before it can be read back
 * cheaply. Same two constants, same caveat: they belong to the model.
 */
const CACHE_READ_RATE = 0.1
const CACHE_WRITE_RATE = 1.25

/**
 * One request's usage, with the three kinds of input kept apart. They
 * have to be apart to be priced -- folded together they are the honest
 * size of the request and tell you nothing about the bill.
 */
export type TokenUsage = {
  /** Fresh input: processed at full price, neither read nor written. */
  inputTokens: number
  outputTokens: number
  /** Input served out of the prompt cache, billed at a tenth. */
  cacheReadTokens: number
  /** Input written into the cache, billed at 1.25x. */
  cacheWriteTokens: number
}

/** Estimated US dollars for one request, at the rates above. */
export function estimateCostUsd(usage: TokenUsage): number {
  // Everything but output is input at some multiplier, so convert the
  // cached parts into their fresh-input equivalent first and price the
  // lot once. Written this way because the alternative -- three separate
  // per-million divisions -- is three places to get a factor of a
  // million wrong.
  const inputEquivalent =
    usage.inputTokens +
    usage.cacheReadTokens * CACHE_READ_RATE +
    usage.cacheWriteTokens * CACHE_WRITE_RATE
  return (
    (inputEquivalent * USD_PER_MILLION_INPUT + usage.outputTokens * USD_PER_MILLION_OUTPUT) /
    1_000_000
  )
}

/**
 * Price what the stream has accumulated so far.
 *
 * The reducer deliberately folds fresh input, cache reads and cache
 * writes into one `inputTokens` total, because that total is the honest
 * size of the request and is what the token count on screen means. This
 * takes them back apart. Skipping that -- pricing everything outside the
 * cache as fresh input -- understates a cold first question by a fifth:
 * the 76-in, 16,938-written request that opens a session is 4.3 cents,
 * not the 3.5 the simpler sum gives, and at the precision a person reads
 * that is the difference between "4" and "3".
 */
export function estimateThinkingCostUsd(state: ThinkingState): number {
  return estimateCostUsd({
    inputTokens: state.inputTokens - state.cachedTokens - state.cacheWriteTokens,
    outputTokens: state.outputTokens,
    cacheReadTokens: state.cachedTokens,
    cacheWriteTokens: state.cacheWriteTokens,
  })
}

/**
 * The amount, as a person reads it at a glance. A whole answer costs a
 * few cents, so dollars-and-cents notation spends four characters saying
 * "0.0" and the interesting digits fall off the end of a phone's status
 * line.
 */
export function formatCostUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`
  const cents = usd * 100
  // Rounding to whole cents prints "0¢" for a tenth of a cent, which
  // says the answer was free. That is the one thing this number must
  // never claim, because the reason it exists is that a producer cannot
  // tell an expensive request from a cheap one by looking. Below a tenth
  // of a cent it says so as a bound rather than growing decimals nobody
  // reads.
  if (cents < 0.05) return cents > 0 ? '<0.1¢' : '0¢'
  // One decimal up to the point where rounding it would print "10.0¢",
  // which is two characters spent on nothing.
  if (cents < 9.95) return `${cents.toFixed(1)}¢`
  return `${Math.round(cents)}¢`
}
