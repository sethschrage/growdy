import { describe, expect, it } from 'vitest'
import { IDLE_THINKING, reduceThinking } from '@/features/chat/thinking'
import type { ChatStreamEvent } from '@/data/chat'

// The status line is the only thing a producer has to go on during a
// twenty-second wait, so what it claims has to follow what actually
// happened. These are the rules that decide that.

function fold(events: ChatStreamEvent[]) {
  return events.reduce(reduceThinking, IDLE_THINKING)
}

describe('reduceThinking', () => {
  it('starts by thinking, and says so', () => {
    expect(fold([{ type: 'turn', index: 1 }]).phrase).toBe('Thinking')
  })

  it('names the tool that is running, in the producer\'s terms', () => {
    const state = fold([
      { type: 'turn', index: 1 },
      { type: 'tool', name: 'execute_readonly_query', state: 'start' },
    ])
    // Not "execute_readonly_query": the producer did not write it and
    // should not have to read it.
    expect(state.phrase).toBe('Reading your vineyard data')
  })

  it('shows what a search is actually searching for', () => {
    const state = fold([
      { type: 'tool', name: 'search_memory', state: 'start', detail: 'frost damage 2025' },
    ])
    expect(state.detail).toBe('frost damage 2025')
  })

  it('falls back to a readable version of a tool it does not know', () => {
    // A tool added on the server without a phrase here should still
    // read as words rather than as an identifier.
    const state = fold([{ type: 'tool', name: 'check_soil_moisture', state: 'start' }])
    expect(state.phrase).toBe('check soil moisture')
  })

  it('moves to writing as soon as the answer starts arriving', () => {
    const state = fold([
      { type: 'turn', index: 1 },
      { type: 'tool', name: 'execute_readonly_query', state: 'start' },
      { type: 'tool', name: 'execute_readonly_query', state: 'done' },
      { type: 'turn', index: 2 },
      { type: 'text', text: 'The north block' },
    ])
    expect(state.phrase).toBe('Writing')
  })

  it('says it is working something out between turns, not still thinking', () => {
    // A second turn means a tool has answered and the model is deciding
    // what that means -- different from the blank first pause.
    const state = fold([
      { type: 'turn', index: 1 },
      { type: 'tool', name: 'search_memory', state: 'done' },
      { type: 'turn', index: 2 },
    ])
    expect(state.phrase).toBe('Working out what that means')
    expect(state.turn).toBe(2)
  })

  it('drops the detail once the tool it belonged to has finished', () => {
    const state = fold([
      { type: 'tool', name: 'web_search', state: 'start', detail: 'powdery mildew' },
      { type: 'tool', name: 'web_search', state: 'done' },
    ])
    expect(state.detail).toBeUndefined()
  })

  it('accumulates tokens across every turn', () => {
    // One turn's usage is not the request's cost -- a five-tool answer
    // pays for the whole transcript again each time round.
    const state = fold([
      { type: 'usage', inputTokens: 1200, outputTokens: 90, cacheReadTokens: 0, cacheWriteTokens: 6600 },
      { type: 'usage', inputTokens: 1600, outputTokens: 140, cacheReadTokens: 6600, cacheWriteTokens: 0 },
    ])
    // Cache reads are input the API bills separately and leaves out of
    // input_tokens, so the honest total includes them.
    expect(state.inputTokens).toBe(2800 + 6600)
    expect(state.outputTokens).toBe(230)
  })

  it('tracks how much of the input came from cache', () => {
    // The number that says whether caching still works. A second turn
    // reading 6,600 tokens back is the loop paying a tenth of the
    // price for the prompt it just sent.
    const state = fold([
      { type: 'usage', inputTokens: 1200, outputTokens: 90, cacheReadTokens: 0, cacheWriteTokens: 6600 },
      { type: 'usage', inputTokens: 40, outputTokens: 140, cacheReadTokens: 6600, cacheWriteTokens: 0 },
    ])
    expect(state.cachedTokens).toBe(6600)
  })

  it('keeps a record of the tools that finished', () => {
    const state = fold([
      { type: 'tool', name: 'execute_readonly_query', state: 'done' },
      { type: 'tool', name: 'search_memory', state: 'done' },
    ])
    expect(state.done).toEqual(['Reading your vineyard data', 'Searching what it remembers'])
  })

  it('ignores events that say nothing about what is happening', () => {
    const state = fold([{ type: 'done', text: 'finished' }])
    expect(state).toEqual(IDLE_THINKING)
  })
})
