import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlantingDetail } from '@/features/producer/PlantingDetail'

// Three states around two reads that can each fail on their own: the
// planting itself, and its history.

const fetchPlanting = vi.fn()
const listObservationsForPlanting = vi.fn()

vi.mock('@/data/vineyard', () => ({
  fetchPlanting: (...args: unknown[]) => fetchPlanting(...args),
}))
vi.mock('@/data/observations', () => ({
  listObservationsForPlanting: (...args: unknown[]) => listObservationsForPlanting(...args),
}))

const planting = {
  id: 'planting-1',
  label: 'R7 P12',
  nickname: null,
  parcel: 'Lockehaven Field',
  plot: 'North Block',
  row_number: 7,
  position: 12,
  variety: 'Pinot Noir',
  scion: null,
  rootstock: null,
  category: null,
  planted_date: '2024-03-02',
  dead_date: null,
  removed_date: null,
  removed_reason: null,
}

beforeEach(() => {
  fetchPlanting.mockReset()
  listObservationsForPlanting.mockReset()
  listObservationsForPlanting.mockResolvedValue([])
})

describe('PlantingDetail', () => {
  it('shows the planting once it loads', async () => {
    fetchPlanting.mockResolvedValue(planting)
    render(<PlantingDetail plantingId="planting-1" onClose={() => {}} />)

    expect((await screen.findAllByText('R7 P12')).length).toBeGreaterThan(0)
    expect(fetchPlanting).toHaveBeenCalledWith('planting-1')
  })

  it('says what went wrong when the planting cannot be read', async () => {
    fetchPlanting.mockRejectedValue(new Error('JWT expired'))
    render(<PlantingDetail plantingId="planting-1" onClose={() => {}} />)

    expect(await screen.findByText('JWT expired')).toBeTruthy()
  })

  it('still shows the planting when only its history fails', async () => {
    // Two independent reads: an unreachable history should not blank out
    // the vine's own details.
    fetchPlanting.mockResolvedValue(planting)
    listObservationsForPlanting.mockRejectedValue(new Error('network'))
    render(<PlantingDetail plantingId="planting-1" onClose={() => {}} />)

    expect((await screen.findAllByText('R7 P12')).length).toBeGreaterThan(0)
    expect(screen.queryByText('network')).toBeNull()
  })

  it('shows one planting\'s observations, not another\'s', async () => {
    // The sheet is mounted with key={plantingId}, so switching plantings
    // remounts it rather than resetting state by hand. This is the
    // behaviour that key buys, tested the way a caller would see it.
    fetchPlanting.mockResolvedValue(planting)
    listObservationsForPlanting.mockResolvedValue([
      { id: 'o1', observed_date: '2026-09-01', note: 'Scraped bark', created_at: '2026-09-01' },
    ])
    const { rerender } = render(
      <PlantingDetail key="planting-1" plantingId="planting-1" onClose={() => {}} />,
    )
    expect(await screen.findByText(/Scraped bark/)).toBeTruthy()

    fetchPlanting.mockResolvedValue({ ...planting, id: 'planting-2', label: 'R8 P1' })
    listObservationsForPlanting.mockResolvedValue([])
    rerender(<PlantingDetail key="planting-2" plantingId="planting-2" onClose={() => {}} />)

    expect((await screen.findAllByText('R8 P1')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Scraped bark/)).toBeNull()
  })
})
