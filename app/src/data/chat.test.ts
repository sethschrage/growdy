import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamChatMessage, type ChatStreamEvent } from '@/data/chat'

// The stream parser, which is the part with a real bug waiting in it:
// an SSE frame can be split across two network reads, and a parser that
// assumes otherwise drops whatever straddles the boundary. That is
// invisible in a fast local test and obvious to a producer on a train.

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  },
}))

const messages = [{ role: 'user' as const, content: 'How is the north block?' }]

/** A response whose body arrives in exactly these chunks. */
function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
  } as unknown as Response
}

function frame(event: ChatStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamChatMessage', () => {
  it('reports every event and returns the finished answer', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        frame({ type: 'turn', index: 1 }),
        frame({ type: 'tool', name: 'execute_readonly_query', state: 'start' }),
        frame({ type: 'text', text: 'Quiet ' }),
        frame({ type: 'text', text: 'since the rain.' }),
        frame({ type: 'usage', inputTokens: 1200, outputTokens: 90, cacheReadTokens: 0, cacheWriteTokens: 6600 }),
        frame({ type: 'done', text: 'Quiet since the rain.' }),
      ]),
    )

    const seen: ChatStreamEvent[] = []
    const answer = await streamChatMessage({ messages }, (event) => seen.push(event))

    expect(answer).toBe('Quiet since the rain.')
    expect(seen.map((e) => e.type)).toEqual(['turn', 'tool', 'text', 'text', 'usage', 'done'])
  })

  it('handles a frame split across two reads', async () => {
    // The network does not respect message boundaries. Splitting mid-
    // JSON is the case that silently loses an event.
    const whole = frame({ type: 'done', text: 'Split cleanly.' })
    const cut = Math.floor(whole.length / 2)
    fetchMock.mockResolvedValue(sseResponse([whole.slice(0, cut), whole.slice(cut)]))

    const seen: ChatStreamEvent[] = []
    const answer = await streamChatMessage({ messages }, (event) => seen.push(event))

    expect(answer).toBe('Split cleanly.')
    expect(seen).toHaveLength(1)
  })

  it('handles several frames arriving in one read', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([frame({ type: 'text', text: 'a' }) + frame({ type: 'done', text: 'a' })]),
    )
    const seen: ChatStreamEvent[] = []
    await streamChatMessage({ messages }, (event) => seen.push(event))
    expect(seen).toHaveLength(2)
  })

  it('throws what an error event says', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        frame({ type: 'text', text: 'Looking...' }),
        frame({ type: 'error', message: 'Anthropic rate limit reached.' }),
      ]),
    )
    await expect(streamChatMessage({ messages }, () => {})).rejects.toThrow(
      'Anthropic rate limit reached.',
    )
  })

  it('falls back to the streamed text if the stream ends without a done event', async () => {
    // A connection cut mid-answer should still leave the producer with
    // what arrived, rather than with nothing.
    fetchMock.mockResolvedValue(
      sseResponse([frame({ type: 'text', text: 'Half an ans' })]),
    )
    expect(await streamChatMessage({ messages }, () => {})).toBe('Half an ans')
  })

  it('still works against a function that answers in JSON', async () => {
    // The client and the function deploy separately, so a newer client
    // can meet an older function. It should not be a broken chat.
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ type: 'text', text: 'Buffered answer.' }),
    } as unknown as Response)

    const seen: ChatStreamEvent[] = []
    const answer = await streamChatMessage({ messages }, (event) => seen.push(event))
    expect(answer).toBe('Buffered answer.')
    expect(seen.map((e) => e.type)).toEqual(['text', 'done'])
  })

  it('asks for a stream, and carries the session token', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame({ type: 'done', text: '' })]))
    await streamChatMessage({ messages }, () => {})

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.accept).toBe('text/event-stream')
    expect(init.headers.authorization).toBe('Bearer token')
  })

  it('sends only role and content, and the photo fields when there is a photo', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame({ type: 'done', text: '' })]))
    await streamChatMessage(
      {
        messages: [{ ...messages[0], feedback: 'up' }],
        photoPath: 'producer-1/abc.jpg',
        photoTakenOn: '2026-09-18',
      },
      () => {},
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages).toEqual([{ role: 'user', content: 'How is the north block?' }])
    expect(body.photoPath).toBe('producer-1/abc.jpg')
    expect(body.photoTakenOn).toBe('2026-09-18')
  })

  it('explains a refusal in the server\'s own words', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Invalid JWT' }),
    } as unknown as Response)

    await expect(streamChatMessage({ messages }, () => {})).rejects.toThrow('Invalid JWT')
  })
})
