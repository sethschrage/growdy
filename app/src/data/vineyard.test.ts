import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from '@/test/fakeSupabase'
import {
  fetchPlanting,
  listParcels,
  listPlotRows,
  listPlots,
  listRowPlantings,
  searchPlantings,
  updatePlotRow,
} from '@/data/vineyard'

vi.mock('@/lib/supabaseClient', async () => ({
  supabase: (await import('@/test/fakeSupabase')).fakeClient,
}))

beforeEach(() => fake.reset())

describe('the vineyard tree', () => {
  it('lists parcels by name', async () => {
    fake.returns([{ id: 'p1', name: 'Lockehaven Field' }])
    expect(await listParcels()).toHaveLength(1)
    expect(fake.only().name).toBe('parcels')
  })

  it('lists the plots of one parcel', async () => {
    fake.returns([])
    await listPlots('parcel-1')
    expect(fake.chainArgs('eq')).toEqual([['parcel_id', 'parcel-1']])
  })

  it('lists the rows of one plot, in row order', async () => {
    fake.returns([])
    await listPlotRows('plot-1')
    expect(fake.chainArgs('eq')).toEqual([['plot_id', 'plot-1']])
    expect(fake.only().chain).toContainEqual(['order', ['number']])
  })

  it('updates one row\'s measurements', async () => {
    await updatePlotRow('row-1', { length_meters: 84.5 })
    const query = fake.only()
    expect(query.chain).toContainEqual(['update', [{ length_meters: 84.5 }]])
    expect(query.chain).toContainEqual(['eq', ['id', 'row-1']])
  })

  it('reads a row\'s plantings from the readable view, excluding removed ones', async () => {
    fake.returns([])
    await listRowPlantings('North Block', 3)

    const query = fake.only()
    // The view, not the planting table: the tree shows variety and
    // rootstock names, and the table holds ids into plant_types (0018).
    expect(query.name).toBe('planting_readable')
    expect(fake.chainArgs('eq')).toEqual([
      ['plot', 'North Block'],
      ['row_number', 3],
    ])
    // A planting that was pulled out is not in the row any more.
    expect(query.chain).toContainEqual(['is', ['removed_date', null]])
  })
})

describe('fetchPlanting', () => {
  it('reads one planting from the readable view', async () => {
    fake.returns({ id: 'planting-1', label: 'R7 P12' })
    const planting = await fetchPlanting('planting-1')
    expect(planting.label).toBe('R7 P12')
    const query = fake.only()
    expect(query.name).toBe('planting_readable')
    expect(fake.chainArgs('eq')).toEqual([['id', 'planting-1']])
  })

  it('throws when the planting cannot be read', async () => {
    // single() on a missing row is an error, and the detail sheet shows
    // it rather than rendering an empty card.
    fake.fails('JSON object requested, multiple (or no) rows returned')
    await expect(fetchPlanting('gone')).rejects.toThrow()
  })
})

describe('searchPlantings', () => {
  it('asks nothing of the database for an empty term', async () => {
    expect(await searchPlantings('   ')).toEqual([])
    expect(fake.queries).toHaveLength(0)
  })

  it('matches the term against every name a producer might use', async () => {
    fake.returns([{ id: 'planting-1' }])
    await searchPlantings('pinot')
    const [[filter]] = fake.chainArgs('or') as [[string]]
    expect(filter).toBe(
      'label.ilike.%pinot%,nickname.ilike.%pinot%,variety.ilike.%pinot%,scion.ilike.%pinot%',
    )
  })

  it('strips characters that would rewrite the filter rather than be matched', async () => {
    // `or()` takes a PostgREST expression, not a parameter: a comma
    // starts a new condition and a parenthesis opens a group, so a term
    // containing them would change what the query asks rather than what
    // it searches for. There is no escape for these inside or().
    fake.returns([])
    await searchPlantings('pinot, noir (old) 100%')
    const [[filter]] = fake.chainArgs('or') as [[string]]
    expect(filter).not.toContain(',noir')
    expect(filter).not.toContain('(')
    expect(filter).not.toContain('%o')
    expect(filter.startsWith('label.ilike.%pinot noir old 100%')).toBe(true)
  })

  it('returns nothing when the term is only strippable characters', async () => {
    expect(await searchPlantings('(),')).toEqual([])
    expect(fake.queries).toHaveLength(0)
  })

  it('excludes removed plantings and caps the list', async () => {
    fake.returns([])
    await searchPlantings('pinot')
    const query = fake.only()
    expect(query.chain).toContainEqual(['is', ['removed_date', null]])
    expect(query.chain).toContainEqual(['limit', [20]])
  })
})
