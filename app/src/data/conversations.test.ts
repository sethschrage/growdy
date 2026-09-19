import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from '@/test/fakeSupabase'
import { listConversations, startConversation, updateConversation } from '@/data/conversations'

vi.mock('@/lib/supabaseClient', async () => ({
  supabase: (await import('@/test/fakeSupabase')).fakeClient,
}))

beforeEach(() => fake.reset())

const transcript = [
  { role: 'user' as const, content: 'How is the north block?' },
  { role: 'assistant' as const, content: 'Quiet since the rain.' },
]

describe('listConversations', () => {
  it('reads history with the most recently touched first', async () => {
    fake.returns([{ id: 'c1', mode: 'ask', transcript, updated_at: '2026-09-19T00:00:00Z' }])
    expect(await listConversations()).toHaveLength(1)
    expect(fake.only().chain).toContainEqual(['order', ['updated_at', { ascending: false }]])
  })
})

describe('startConversation', () => {
  it('inserts with the id the client generated', async () => {
    // The client owns the id (0011) so a graphic can be shared out of a
    // conversation that has not been logged yet. An insert that let the
    // database pick one would make that id a lie.
    await startConversation('conversation-1', 'producer-1', transcript)
    const query = fake.only()
    expect(query.name).toBe('conversations')
    expect(query.chain).toContainEqual([
      'insert',
      [{ id: 'conversation-1', producer_id: 'producer-1', mode: 'ask', transcript }],
    ])
  })

  it('throws if the insert is rejected', async () => {
    fake.fails('duplicate key value violates unique constraint')
    await expect(startConversation('conversation-1', 'producer-1', transcript)).rejects.toThrow(
      'duplicate key',
    )
  })
})

describe('updateConversation', () => {
  it('replaces the transcript and moves updated_at', async () => {
    await updateConversation('conversation-1', transcript)
    const [[patch]] = fake.chainArgs('update') as [[{ transcript: unknown; updated_at: string }]]
    expect(patch.transcript).toEqual(transcript)
    // History is ordered by this column, so a conversation that keeps
    // going has to keep rising.
    expect(Number.isNaN(Date.parse(patch.updated_at))).toBe(false)
    expect(fake.chainArgs('eq')).toEqual([['id', 'conversation-1']])
  })
})
