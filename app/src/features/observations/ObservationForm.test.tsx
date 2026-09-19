import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { ObservationForm } from '@/features/observations/ObservationForm'

// The planting typeahead, which is the part of this form with real
// behaviour: it debounces, it can be answered out of order, and it has
// to forget itself when the box is emptied.

const searchPlantings = vi.fn()
vi.mock('@/data/vineyard', () => ({
  searchPlantings: (...args: unknown[]) => searchPlantings(...args),
}))
vi.mock('@/data/profile', () => ({ fetchProducerId: async () => 'producer-1' }))
vi.mock('@/data/observations', () => ({ createObservationCandidate: async () => 'candidate-1' }))

const session = { user: { id: 'user-1' } } as Session

function typeInto(field: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  searchPlantings.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the planting typeahead', () => {
  it('waits before searching, so a word is one query and not six', async () => {
    searchPlantings.mockResolvedValue([])
    render(<ObservationForm session={session} onClose={() => {}} />)
    const field = screen.getByPlaceholderText(/search/i)

    act(() => typeInto(field, 'p'))
    act(() => typeInto(field, 'pi'))
    act(() => typeInto(field, 'pin'))
    expect(searchPlantings).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(searchPlantings).toHaveBeenCalledTimes(1)
    expect(searchPlantings).toHaveBeenCalledWith('pin')
  })

  it('shows what came back', async () => {
    searchPlantings.mockResolvedValue([
      { id: 'planting-1', label: 'R7 P12', nickname: null, variety: 'Pinot Noir', scion: null, parcel: 'Lockehaven' },
    ])
    render(<ObservationForm session={session} onClose={() => {}} />)

    act(() => typeInto(screen.getByPlaceholderText(/search/i), 'pinot'))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(await screen.findByText(/R7 P12/)).toBeTruthy()
  })

  it('forgets its results when the box is emptied', async () => {
    // Clearing happens on the change event rather than in an effect, so
    // this is the test that the two stay connected.
    searchPlantings.mockResolvedValue([
      { id: 'planting-1', label: 'R7 P12', nickname: null, variety: null, scion: null, parcel: 'Lockehaven' },
    ])
    render(<ObservationForm session={session} onClose={() => {}} />)
    const field = screen.getByPlaceholderText(/search/i)

    act(() => typeInto(field, 'pinot'))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(await screen.findByText(/R7 P12/)).toBeTruthy()

    act(() => typeInto(field, ''))
    await waitFor(() => expect(screen.queryByText(/R7 P12/)).toBeNull())
  })

  it('ignores a search that lands after the box was cleared', async () => {
    // The slow reply for "pinot" must not repopulate a list the producer
    // has already emptied.
    let resolveSearch: (rows: unknown[]) => void = () => {}
    searchPlantings.mockImplementation(
      () => new Promise((resolve) => (resolveSearch = resolve as (rows: unknown[]) => void)),
    )
    render(<ObservationForm session={session} onClose={() => {}} />)
    const field = screen.getByPlaceholderText(/search/i)

    act(() => typeInto(field, 'pinot'))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    act(() => typeInto(field, ''))

    await act(async () => {
      resolveSearch([
        { id: 'planting-1', label: 'R7 P12', nickname: null, variety: null, scion: null, parcel: 'Lockehaven' },
      ])
    })

    expect(screen.queryByText(/R7 P12/)).toBeNull()
  })
})
