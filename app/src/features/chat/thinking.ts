import type { ChatStreamEvent } from '@/data/chat'

// What the app says it is doing, and how a stream event changes that.
//
// Separate from the component because it is the part with opinions in
// it: which tool reads as which phrase, when "thinking" becomes
// "writing", what counts as the model having understood something. A
// component that also exported this broke fast refresh, and the
// reducer is the half worth testing.

const TOOL_PHRASES: Record<string, string> = {
  execute_readonly_query: 'Reading your vineyard data',
  propose_write_query: 'Drafting a change for you to confirm',
  search_memory: 'Searching what it remembers',
  get_grape_phenology: 'Checking grapevine phenology',
  view_photo: 'Looking at the photo',
  web_search: 'Searching the web',
  web_fetch: 'Reading a page',
}

/**
 * Where an answer's material came from, as far as the stream can prove.
 * A tool ran; whether the model leaned on what came back is not
 * something any event here can attest to, which is why the line this
 * feeds says "Looked at" rather than "Sources".
 */
export type SourceKind = 'weather' | 'vineyard' | 'memory' | 'phenology' | 'web' | 'photo'

/**
 * One thing the answer did, as the stream reported it.
 *
 * `running` is the difference between a step that is taking a while and
 * a step that finished a while ago, which is the whole reason a producer
 * opens this: a wait with four completed steps and a fifth still going
 * is a working answer, and the same wait with nothing running is a stuck
 * one.
 */
export type Step = {
  phrase: string
  detail?: string
  running: boolean
}

export type ThinkingState = {
  phrase: string
  detail?: string
  turn: number
  inputTokens: number
  outputTokens: number
  /** Of the input tokens, how many were served from the prompt cache. */
  cachedTokens: number
  /**
   * Of the input tokens, how many were written into the cache. Kept
   * apart for one reason: it is the only way to price the request.
   * inputTokens folds all three kinds of input together because that sum
   * is the honest size of what was processed, but a write is billed at
   * 1.25x a fresh token and a read at a tenth, so the sum says nothing
   * about the bill. See cost.ts.
   */
  cacheWriteTokens: number
  /**
   * Every step this answer has taken, oldest first, running one last.
   *
   * This used to be `done: string[]` -- the phrases of finished tools,
   * and nothing rendered it. The detail was dropped on the floor, which
   * is the half worth having: "Reading your vineyard data" is a
   * category, "weather_observations, plantings" is what it actually
   * went and looked at.
   */
  steps: Step[]
  /** What this answer looked at, first mention first. */
  sources: SourceKind[]
}

export const IDLE_THINKING: ThinkingState = {
  phrase: 'Thinking',
  turn: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  cacheWriteTokens: 0,
  steps: [],
  sources: [],
}

/**
 * Which source a tool call drew on. For a SQL query the function sends
 * the relations it named, so a weather question is distinguishable from
 * a planting one -- without that detail every query reads as "vineyard",
 * which is the honest fallback rather than a guess.
 */
function sourceFor(name: string, detail?: string): SourceKind | undefined {
  switch (name) {
    case 'execute_readonly_query':
      return detail?.includes('weather_observations') ? 'weather' : 'vineyard'
    case 'search_memory':
      return 'memory'
    case 'get_grape_phenology':
      return 'phenology'
    case 'web_search':
    case 'web_fetch':
      return 'web'
    case 'view_photo':
      return 'photo'
    // propose_write_query is a change, not a reading.
    default:
      return undefined
  }
}

/**
 * Marks the most recent still-running step with this phrase as finished.
 *
 * The most recent rather than the first, because a turn can call the
 * same tool twice and the end event that just arrived belongs to the one
 * that started last. An end with no matching start leaves the list
 * alone: a step that was never announced is not a step this can close.
 */
function endLastRunning(steps: Step[], phrase: string): Step[] {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].running && steps[i].phrase === phrase) {
      const next = [...steps]
      next[i] = { ...next[i], running: false }
      return next
    }
  }
  return steps
}

/** Folds one stream event into what the status line should say. */
export function reduceThinking(state: ThinkingState, event: ChatStreamEvent): ThinkingState {
  switch (event.type) {
    case 'turn':
      // A turn after the first means the model has looked something up
      // and is deciding what to do with it.
      return {
        ...state,
        turn: event.index,
        phrase: event.index === 1 ? 'Thinking' : 'Working out what that means',
        detail: undefined,
      }
    case 'tool': {
      const phrase = TOOL_PHRASES[event.name] ?? event.name.replace(/_/g, ' ')
      if (event.state === 'start') {
        const source = sourceFor(event.name, event.detail)
        return {
          ...state,
          phrase,
          detail: event.detail,
          steps: [...state.steps, { phrase, detail: event.detail, running: true }],
          // First mention wins, so the line reads in the order the
          // answer actually went looking.
          sources:
            source && !state.sources.includes(source) ? [...state.sources, source] : state.sources,
        }
      }
      // Ends the matching step rather than appending a second one. The
      // last running step with this phrase, because the same tool can be
      // called more than once in a turn and the one that just finished
      // is the one that started most recently.
      return {
        ...state,
        steps: endLastRunning(state.steps, phrase),
        detail: undefined,
      }
    }
    case 'text':
      // Text arriving means the answer itself has started.
      return { ...state, phrase: 'Writing', detail: undefined }
    case 'usage':
      return {
        ...state,
        // Cache reads and writes are both input tokens the API reports
        // separately and leaves out of input_tokens, so the total is the
        // sum of all three. Leaving writes out made the most expensive
        // token type invisible: a cold first question displayed 126
        // tokens while processing 17,014 of them, and the write is
        // billed at 1.25x rather than a read's 0.1x.
        inputTokens:
          state.inputTokens + event.inputTokens + event.cacheReadTokens + event.cacheWriteTokens,
        outputTokens: state.outputTokens + event.outputTokens,
        cachedTokens: state.cachedTokens + event.cacheReadTokens,
        cacheWriteTokens: state.cacheWriteTokens + event.cacheWriteTokens,
      }
    default:
      return state
  }
}
