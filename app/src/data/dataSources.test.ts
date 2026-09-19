import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from '@/test/fakeSupabase'
import {
  addDataSource,
  addWeatherSource,
  deleteSource,
  listProviders,
  listSources,
  setSourceEnabled,
  updateSourceConfig,
} from '@/data/dataSources'

vi.mock('@/lib/supabaseClient', async () => ({
  supabase: (await import('@/test/fakeSupabase')).fakeClient,
}))

beforeEach(() => fake.reset())

describe('listing', () => {
  it('offers only providers that are switched on', async () => {
    // A disabled provider is one the project isn't ready to let anyone
    // connect to; listing it puts a button in front of a producer that
    // cannot work.
    fake.returns([])
    await listProviders()
    expect(fake.chainArgs('eq')).toEqual([['enabled', true]])
  })

  it('reads a source\'s sync state along with its identity', async () => {
    fake.returns([])
    await listSources()
    const columns = String(fake.only().chain[0][1][0])
    // The view shows why a source is quiet, so the columns that carry
    // that have to be asked for.
    expect(columns).toContain('backfill_status')
    expect(columns).toContain('last_synced_at')
    expect(columns).toContain('last_error')
  })
})

describe('addDataSource', () => {
  it('adds a source with no credential through the RPC', async () => {
    fake.returns('source-1')
    expect(await addDataSource({ providerId: 'p1', name: 'NOAA', externalId: 'default' })).toBe(
      'source-1',
    )
    const query = fake.only()
    expect(query.kind).toBe('rpc')
    expect(query.name).toBe('add_data_source')
    expect(query.args[0]).toEqual({
      p_provider_id: 'p1',
      p_name: 'NOAA',
      p_external_id: 'default',
      p_config: null,
    })
  })

  it('carries a device position as config', async () => {
    fake.returns('source-2')
    const config = { latitude: 38.41, longitude: -122.4383, captured_at: '2026-09-19T12:00:00.000Z' }
    await addDataSource({ providerId: 'p1', name: 'This device', externalId: 'device', config })
    expect(fake.only().args[0]).toMatchObject({ p_config: config })
  })
})

describe('changing a source', () => {
  it('overwrites the device position in place', async () => {
    const config = { latitude: 1, longitude: 2, captured_at: '2026-09-19T12:00:00.000Z' }
    await updateSourceConfig('source-1', config)
    expect(fake.only().chain).toContainEqual(['update', [{ config }]])
  })

  it('toggles exactly the source it is given', async () => {
    await setSourceEnabled('source-1', false)
    const query = fake.only()
    expect(query.chain).toContainEqual(['update', [{ enabled: false }]])
    expect(query.chain).toContainEqual(['eq', ['id', 'source-1']])
  })

  it('deletes one source', async () => {
    await deleteSource('source-1')
    expect(fake.only().chain).toContainEqual(['delete', []])
  })
})

describe('addWeatherSource', () => {
  it('sends the credential to the Edge Function, not to a table', async () => {
    // The secret goes into the vault on the server side; an insert from
    // here would put it in a column the client can read back.
    await addWeatherSource({ providerId: 'p1', name: 'Home', stationId: '12345', secret: 'token' })
    const query = fake.only()
    expect(query.kind).toBe('invoke')
    expect(query.name).toBe('add-weather-source')
    expect(query.args[0]).toEqual({
      body: { provider_id: 'p1', name: 'Home', station_id: '12345', secret: 'token' },
    })
  })

  it('throws the message the function put in its body', async () => {
    // What arrives at this level is "Edge Function returned a non-2xx
    // status code", which is true and useless. The reason a station was
    // rejected is in the body.
    fake.invokeFails({
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({ error: 'That station ID is not on your Tempest account.' }) },
    })
    await expect(
      addWeatherSource({ providerId: 'p1', name: 'Home', stationId: 'nope', secret: 'token' }),
    ).rejects.toThrow('That station ID is not on your Tempest account.')
  })

  it('falls back to the transport message when the body is not JSON', async () => {
    fake.invokeFails({
      message: 'Failed to fetch',
      context: {
        json: async () => {
          throw new Error('not json')
        },
      },
    })
    await expect(
      addWeatherSource({ providerId: 'p1', name: 'Home', stationId: '1', secret: 'token' }),
    ).rejects.toThrow('Failed to fetch')
  })

  it('resolves quietly when the function accepted it', async () => {
    await expect(
      addWeatherSource({ providerId: 'p1', name: 'Home', stationId: '1', secret: 'token' }),
    ).resolves.toBeUndefined()
  })
})
