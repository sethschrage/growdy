import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from '@/test/fakeSupabase'
import { fetchMaintenanceStatus } from '@/data/appStatus'
import { confirmWrite, declineWrite } from '@/data/writes'
import { sendChatMessage } from '@/data/chat'

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

describe('sendChatMessage', () => {
  const messages = [{ role: 'user' as const, content: 'How is the north block?' }]

  it('sends only role and content, and omits photo fields when there is no photo', async () => {
    // Feedback lives on the message in the client's own state; the
    // function has no use for it, and sending it would put it in the
    // model's context.
    fake.invokeReturns({ text: 'Quiet since the rain.' })
    await sendChatMessage({ messages: [{ ...messages[0], feedback: 'up' }] })

    const body = (fake.only().args[0] as { body: Record<string, unknown> }).body
    expect(body.messages).toEqual([{ role: 'user', content: 'How is the north block?' }])
    expect('photoPath' in body).toBe(false)
    expect('photoTakenOn' in body).toBe(false)
  })

  it('sends the photo path and its date when this turn is about a photo', async () => {
    fake.invokeReturns({ text: 'Looks like beetle damage.' })
    await sendChatMessage({
      messages,
      photoPath: 'producer-1/abc.jpg',
      photoTakenOn: '2026-09-18',
    })
    const body = (fake.only().args[0] as { body: Record<string, unknown> }).body
    expect(body.photoPath).toBe('producer-1/abc.jpg')
    expect(body.photoTakenOn).toBe('2026-09-18')
  })

  it('throws the error the function explained, not the transport\'s', async () => {
    fake.invokeFails({
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({ error: 'Anthropic rate limit reached.' }) },
    })
    await expect(sendChatMessage({ messages })).rejects.toThrow('Anthropic rate limit reached.')
  })

  it('falls back to the transport message when there is no JSON body', async () => {
    fake.invokeFails({
      message: 'Failed to fetch',
      context: {
        json: async () => {
          throw new Error('not json')
        },
      },
    })
    await expect(sendChatMessage({ messages })).rejects.toThrow('Failed to fetch')
  })
})
