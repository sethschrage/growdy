import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from '@/test/fakeSupabase'
import {
  fetchLastSeenRelease,
  fetchProducerId,
  hasProfile,
  markReleaseSeen,
} from '@/data/profile'

vi.mock('@/lib/supabaseClient', async () => ({
  supabase: (await import('@/test/fakeSupabase')).fakeClient,
}))

beforeEach(() => fake.reset())

describe('fetchProducerId', () => {
  it('reads the producer off the caller\'s own profile row', async () => {
    fake.returns({ producer_id: 'producer-1' })
    expect(await fetchProducerId('user-1')).toBe('producer-1')

    // producer_id is the tenancy key -- every insert the client makes is
    // scoped by it -- so the row this reads must be the signed-in user's
    // own, not whichever row comes back first.
    expect(fake.only().name).toBe('profiles')
    expect(fake.chainArgs('eq')).toEqual([['id', 'user-1']])
  })

  it('returns null for an account with no profile row', async () => {
    // A real state for this app, not a fault: see 0026 and
    // NoProducerScreen. maybeSingle is what makes it a null rather than
    // an error, so this fails if someone switches it back to single().
    fake.returns(null)
    expect(await fetchProducerId('user-1')).toBeNull()
    expect(fake.only().chain.map(([m]) => m)).toContain('maybeSingle')
  })

  it('throws when the lookup itself fails', async () => {
    fake.fails('JWT expired')
    await expect(fetchProducerId('user-1')).rejects.toThrow('JWT expired')
  })
})

describe('hasProfile', () => {
  it('is true when a row comes back and false when none does', async () => {
    fake.returns({ id: 'user-1' })
    expect(await hasProfile('user-1')).toBe(true)

    fake.reset()
    fake.returns(null)
    expect(await hasProfile('user-1')).toBe(false)
  })
})

describe('release tracking', () => {
  it('reads the last release the producer dismissed', async () => {
    fake.returns({ last_seen_release: 'v0.13.0' })
    expect(await fetchLastSeenRelease('user-1')).toBe('v0.13.0')
  })

  it('reads null for someone who has never dismissed one', async () => {
    fake.returns({ last_seen_release: null })
    expect(await fetchLastSeenRelease('user-1')).toBeNull()
  })

  it('writes the tag against that user only', async () => {
    await markReleaseSeen('user-1', 'v0.14.0')
    const query = fake.only()
    expect(query.name).toBe('profiles')
    expect(query.chain).toContainEqual(['update', [{ last_seen_release: 'v0.14.0' }]])
    expect(query.chain).toContainEqual(['eq', ['id', 'user-1']])
  })
})
