import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AnswerMeta } from '@/features/chat/AnswerMeta'

// The line is quiet and easy to get subtly wrong: it must say nothing
// when there is nothing to say, and must never name a station it cannot
// identify.

vi.mock('@/data/dataSources', () => ({
  listSources: async () => [
    { id: 's1', name: 'Lockehaven Field', provider_id: 'p1', enabled: true },
    { id: 's2', name: 'This device', provider_id: 'p2', enabled: true },
  ],
  listProviders: async () => [
    { id: 'p1', name: 'Tempest', category: 'weather', enabled: true },
    { id: 'p2', name: 'Device', category: 'location', enabled: true },
  ],
}))

describe('AnswerMeta', () => {
  it('says nothing when there is nothing to say', () => {
    const { container } = render(<AnswerMeta />)
    expect(container.innerHTML).toBe('')
  })

  it('names the producer\'s own station once it resolves', async () => {
    render(<AnswerMeta sources={['weather', 'vineyard']} />)
    // Before the lookup lands it must still be true, just less specific.
    expect(screen.getByText(/Looked at:/)).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByText(/Lockehaven Field \(Tempest\)/)).toBeTruthy(),
    )
    expect(screen.getByText(/your vineyard records/)).toBeTruthy()
  })

  it('shows what the answer cost, with the cached part called out', () => {
    render(<AnswerMeta tokens={{ total: 146681, cached: 135504 }} />)
    expect(screen.getByText(/146,681 tokens/)).toBeTruthy()
    expect(screen.getByText(/135,504 cached/)).toBeTruthy()
  })

  it('leaves the cached note off when nothing was cached', () => {
    // A cold first question has nothing cached, and a "(0 cached)" would
    // read as a fault rather than as a cold start.
    render(<AnswerMeta tokens={{ total: 17014, cached: 0 }} />)
    expect(screen.getByText(/17,014 tokens/)).toBeTruthy()
    expect(screen.queryByText(/cached/)).toBeNull()
  })
})
