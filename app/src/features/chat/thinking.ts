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

export type ThinkingState = {
  phrase: string
  detail?: string
  turn: number
  inputTokens: number
  outputTokens: number
  /** Tools finished this request, oldest first. */
  done: string[]
}

export const IDLE_THINKING: ThinkingState = {
  phrase: 'Thinking',
  turn: 0,
  inputTokens: 0,
  outputTokens: 0,
  done: [],
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
    case 'tool':
      if (event.state === 'start') {
        return {
          ...state,
          phrase: TOOL_PHRASES[event.name] ?? event.name.replace(/_/g, ' '),
          detail: event.detail,
        }
      }
      return {
        ...state,
        done: [...state.done, TOOL_PHRASES[event.name] ?? event.name.replace(/_/g, ' ')],
        detail: undefined,
      }
    case 'text':
      // Text arriving means the answer itself has started.
      return { ...state, phrase: 'Writing', detail: undefined }
    case 'usage':
      return {
        ...state,
        inputTokens: state.inputTokens + event.inputTokens,
        outputTokens: state.outputTokens + event.outputTokens,
      }
    default:
      return state
  }
}
