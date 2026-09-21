import type { ChatMessage } from '@/features/chat/types'
import { supabase } from '@/lib/supabaseClient'

// The chat Edge Function (0016): the client sends the transcript and
// gets a composed reply back. Everything interesting -- the model, the
// tools, the SQL it writes and runs, the memory search -- happens on the
// other side of this call, because that is where the API key lives.

export type ChatReply = { type?: string; text?: string; message?: string }

export type ChatRequest = {
  messages: ChatMessage[]
  // The storage path of a photo this turn is about, and the day it was
  // taken. Sent per request rather than kept in the transcript: the
  // stored conversation holds what was said, not where the bytes are.
  photoPath?: string | null
  photoTakenOn?: string | null
}

// What the function reports while it works. Each of these corresponds
// to something that actually happened -- a model turn, a named tool, a
// piece of the answer, what it cost -- rather than to a timer.
export type ChatStreamEvent =
  | { type: 'turn'; index: number }
  | { type: 'tool'; name: string; state: 'start' | 'done' | 'error'; detail?: string }
  | { type: 'text'; text: string }
  /**
   * The model's own reasoning, summarized, as the function forwards it.
   * Deliberately not 'text': it is not the answer and must never be
   * appended to the message being read.
   */
  | { type: 'thinking'; text: string }
  | {
      type: 'usage'
      inputTokens: number
      outputTokens: number
      /** Read from the prompt cache, and written to it. */
      cacheReadTokens: number
      cacheWriteTokens: number
    }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string }

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`

/**
 * An error the server itself produced: a refusal, a 500, or an `error`
 * event mid-stream. Distinguished from a transport failure because the
 * first must be shown to the producer as-is and the second is worth
 * trying again differently.
 */
class ChatServiceError extends Error {}

/** The body both shapes of this request send. */
function requestBody(request: ChatRequest) {
  return JSON.stringify({
    messages: request.messages.map(({ role, content }) => ({ role, content })),
    ...(request.photoPath ? { photoPath: request.photoPath } : {}),
    ...(request.photoTakenOn ? { photoTakenOn: request.photoTakenOn } : {}),
  })
}

function headers(token: string, accept: string) {
  return {
    'content-type': 'application/json',
    // The function decides which shape to answer in from this header.
    accept,
    authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }
}

/**
 * The same request, watched rather than waited on.
 *
 * supabase-js's `functions.invoke` buffers the whole response before it
 * resolves, which is the one thing a stream must not do, so this goes
 * to fetch directly and carries the session's own access token --
 * exactly what invoke would have sent, since the function builds its
 * database client from that JWT and every query it runs is RLS-scoped
 * to the caller.
 *
 * Returns the finished text, the same as the buffered call, so the
 * transcript is stored identically however it arrived.
 *
 * A streamed reply can fail to arrive while the function is perfectly
 * healthy. The iOS shell rejected one with a bare "Load failed" while
 * the function answered 200, ran the model and logged a complete turn --
 * the answer existed and the producer saw an error. Twenty minutes later
 * the same shell streamed the same kind of request without trouble, so
 * this is an intermittent transport failure rather than a client that
 * cannot stream: a dropped connection, a backgrounded app, a cold start
 * landing badly.
 *
 * Which is exactly the case worth a fallback. A transport failure with
 * nothing received asks the same question again buffered -- how this
 * worked before streaming existed -- at the cost of a second model turn,
 * which is the right price for the difference between a slower answer
 * and no answer.
 */
export async function streamChatMessage(
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You are signed out. Sign in and try again.')

  const progress = { received: false }
  try {
    return await streamOnce(request, token, onEvent, signal, progress)
  } catch (error) {
    // Anything the server said, anything the producer cancelled, and
    // anything that arrived before the failure: not ours to retry.
    if (error instanceof ChatServiceError) throw error
    if (signal?.aborted) throw error
    if (progress.received) throw error
    return await askBuffered(request, token, onEvent, signal)
  }
}

/** The pre-streaming path, kept alive as the fallback. */
async function askBuffered(
  request: ChatRequest,
  token: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: headers(token, 'application/json'),
    body: requestBody(request),
    signal,
  })
  if (!response.ok) throw new ChatServiceError(await failureMessage(response))

  const body = (await response.json()) as ChatReply
  if (body.type === 'error') throw new ChatServiceError(body.message ?? 'Something went wrong.')
  const text = body.text ?? ''
  onEvent({ type: 'text', text })
  onEvent({ type: 'done', text })
  return text
}

/** Whatever the server said about why it refused. */
async function failureMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (body?.error || body?.message) return body.error ?? body.message
  } catch {
    // Not JSON -- keep the status message.
  }
  return `The chat service answered ${response.status}.`
}

async function streamOnce(
  request: ChatRequest,
  token: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal | undefined,
  progress: { received: boolean },
): Promise<string> {
  const response = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: headers(token, 'text/event-stream'),
    body: requestBody(request),
    signal,
  })

  if (!response.ok) throw new ChatServiceError(await failureMessage(response))

  // A function deployed before this change answers in JSON however the
  // request was framed. The client and the function ship separately, so
  // that window is real, and falling back is cheaper than a broken chat
  // for however long it lasts.
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    const body = (await response.json()) as ChatReply
    if (body.type === 'error') throw new ChatServiceError(body.message ?? 'Something went wrong.')
    const text = body.text ?? ''
    onEvent({ type: 'text', text })
    onEvent({ type: 'done', text })
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalText = ''
  let streamedText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Frames are separated by a blank line, and one can be split across
    // reads, so whatever follows the last separator stays buffered.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      let event: ChatStreamEvent
      try {
        event = JSON.parse(line.slice(5).trim())
      } catch {
        continue
      }
      if (event.type === 'text') streamedText += event.text
      if (event.type === 'done') finalText = event.text
      if (event.type === 'error') throw new ChatServiceError(event.message)
      progress.received = true
      onEvent(event)
    }
  }

  // `done` carries the authoritative text; the deltas are what was
  // shown while waiting, and they agree unless the stream was cut off.
  return finalText || streamedText
}
