import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from '@/test/fakeSupabase'
import { fetchMaintenanceStatus } from '@/data/appStatus'
import { confirmWrite, declineWrite } from '@/data/writes'

// The small modules together, rather than three files of three tests.

vi.mock('@/lib/supabaseClient', async () => ({
  supabase: (await import('@/test/fakeSupabase')).fakeClient,
}))

beforeEach(() => fake.reset())

describe('app status', () => {
  it('reads the maintenance flag and its message', async () => {
    fake.returns({ maintenance: true, message: 'Back in ten minutes.' })
    expect(await fetchMaintenanceStatus()).toEqual({
      maintenance: true,
      message: 'Back in ten minutes.',
    })
  })

  it('answers null when it cannot tell, instead of throwing', async () => {
    // This one runs on a 30-second timer behind whatever the producer is
    // doing. A network blip must not surface as a failure, and above all
    // must not read as a maintenance block -- not knowing means carry on.
    fake.fails('Failed to fetch')
    expect(await fetchMaintenanceStatus()).toBeNull()
  })
})

describe('write proposals', () => {
  it('confirms by proposal id and returns what the database did', async () => {
    fake.returns({ applied: 1 })
    expect(await confirmWrite('proposal-1')).toEqual({ applied: 1 })
    const query = fake.only()
    expect(query.kind).toBe('rpc')
    expect(query.name).toBe('confirm_write')
    expect(query.args[0]).toEqual({ p_proposal_id: 'proposal-1' })
  })

  it('surfaces a refusal rather than reporting a write that did not happen', async () => {
    // 0022's whole point is that a write is reported only after it
    // happened.
    fake.fails('proposal already applied')
    await expect(confirmWrite('proposal-1')).rejects.toThrow('proposal already applied')
  })

  it('declines by marking the pending row', async () => {
    await declineWrite('proposal-1')
    const query = fake.only()
    expect(query.name).toBe('pending_writes')
    expect(query.chain).toContainEqual(['update', [{ status: 'declined' }]])
    expect(query.chain).toContainEqual(['eq', ['id', 'proposal-1']])
  })
})
