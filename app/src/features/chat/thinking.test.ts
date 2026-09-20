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
    // Cache reads and writes are both input the API bills separately and
    // leaves out of input_tokens, so the honest total includes both: the
    // 6,600 written on the first turn and the 6,600 read back on the
    // second are each real work, priced differently.
    expect(state.inputTokens).toBe(2800 + 6600 + 6600)
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

  it('keeps every step, in the order the answer took them', () => {
    const state = fold([
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'plantings' },
      { type: 'tool', name: 'execute_readonly_query', state: 'done' },
      { type: 'tool', name: 'search_memory', state: 'start', detail: 'frost' },
    ])
    expect(state.steps).toEqual([
      { phrase: 'Reading your vineyard data', detail: 'plantings', running: false },
      { phrase: 'Searching what it remembers', detail: 'frost', running: true },
    ])
  })

  it('keeps the detail, which is the half worth having', () => {
    // "Reading your vineyard data" is a category; the relations are what
    // it actually went and looked at.
    const state = fold([
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'weather_observations' },
    ])
    expect(state.steps[0].detail).toBe('weather_observations')
  })

  it('ends the step that started most recently, not the first one', () => {
    // A turn can call the same tool twice. The end that just arrived
    // belongs to the one that started last.
    const state = fold([
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'plantings' },
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'parcels' },
      { type: 'tool', name: 'execute_readonly_query', state: 'done' },
    ])
    expect(state.steps.map((s) => s.running)).toEqual([true, false])
  })

  it('finishes both when the same tool is called twice and both return', () => {
    // Closing "the most recent with this phrase" without checking that it
    // is still running closes the same step twice and leaves the first
    // one spinning forever -- a trace that says the answer is still
    // reading the vineyard when it finished doing that ten seconds ago.
    const state = fold([
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'plantings' },
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'parcels' },
      { type: 'tool', name: 'execute_readonly_query', state: 'done' },
      { type: 'tool', name: 'execute_readonly_query', state: 'done' },
    ])
    expect(state.steps.map((s) => s.running)).toEqual([false, false])
  })

  it('ignores an end for a step that was never announced', () => {
    const state = fold([{ type: 'tool', name: 'search_memory', state: 'done' }])
    expect(state.steps).toEqual([])
  })

  it('counts cache writes, which are the expensive ones', () => {
    // A first question of the day writes the whole prompt into the cache
    // at 1.25x and reads nothing back. Leaving writes out of the total
    // displayed 126 tokens for a request that processed 17,014 and cost
    // more than the eight-turn one that followed it.
    const state = fold([
      { type: 'usage', inputTokens: 76, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 16938 },
    ])
    expect(state.inputTokens).toBe(76 + 16938)
    expect(state.cachedTokens).toBe(0)
  })

  it('names the weather station as a source when a query reads it', () => {
    // The function sends the relations a query named, which is the only
    // thing that tells a weather question from a planting one.
    const state = fold([
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'weather_observations, data_sources' },
    ])
    expect(state.sources).toEqual(['weather'])
  })

  it('falls back to the vineyard for any other query', () => {
    const state = fold([
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'planting_readable, parcels' },
    ])
    expect(state.sources).toEqual(['vineyard'])
  })

  it('still says vineyard when the function sent no relations at all', () => {
    // An older function deployed before this change sends no detail. The
    // honest fallback is the general answer, not silence.
    const state = fold([{ type: 'tool', name: 'execute_readonly_query', state: 'start' }])
    expect(state.sources).toEqual(['vineyard'])
  })

  it('lists each source once, in the order it was first reached', () => {
    const state = fold([
      { type: 'tool', name: 'search_memory', state: 'start', detail: 'frost' },
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'weather_observations' },
      { type: 'tool', name: 'execute_readonly_query', state: 'start', detail: 'weather_observations' },
      { type: 'tool', name: 'web_search', state: 'start', detail: 'powdery mildew' },
    ])
    expect(state.sources).toEqual(['memory', 'weather', 'web'])
  })

  it('does not call a proposed write a source', () => {
    // It is a change the producer has not confirmed yet, not something
    // the answer read.
    const state = fold([{ type: 'tool', name: 'propose_write_query', state: 'start' }])
    expect(state.sources).toEqual([])
  })

  it('ignores events that say nothing about what is happening', () => {
    const state = fold([{ type: 'done', text: 'finished' }])
    expect(state).toEqual(IDLE_THINKING)
  })
})
