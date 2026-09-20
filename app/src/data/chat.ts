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

// Throws with the server's own message rather than the transport's.
// A function that rejects a request explains why in its JSON body, and
// `error.message` at this level is only ever "Edge Function returned a
// non-2xx status code" -- true, and useless to the producer reading it.
export async function sendChatMessage(request: ChatRequest): Promise<ChatReply> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: {
      messages: request.messages.map(({ role, content }) => ({ role, content })),
      ...(request.photoPath ? { photoPath: request.photoPath } : {}),
      ...(request.photoTakenOn ? { photoTakenOn: request.photoTakenOn } : {}),
    },
  })

  if (error) {
    let message = error.message
    try {
      const body = await (error as { context: Response }).context.json()
      if (body?.error) message = body.error
    } catch {
      // The context wasn't a JSON response -- fall back to error.message.
    }
    throw new Error(message)
  }

  return data as ChatReply
}

// What the function reports while it works. Each of these corresponds
// to something that actually happened -- a model turn, a named tool, a
// piece of the answer, what it cost -- rather than to a timer.
export type ChatStreamEvent =
  | { type: 'turn'; index: number }
  | { type: 'tool'; name: string; state: 'start' | 'done' | 'error'; detail?: string }
  | { type: 'text'; text: string }
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
 */
export async function streamChatMessage(
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You are signed out. Sign in and try again.')

  const response = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The function decides which shape to answer in from this header.
      accept: 'text/event-stream',
      authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      messages: request.messages.map(({ role, content }) => ({ role, content })),
      ...(request.photoPath ? { photoPath: request.photoPath } : {}),
      ...(request.photoTakenOn ? { photoTakenOn: request.photoTakenOn } : {}),
    }),
    signal,
  })

  if (!response.ok) {
    let message = `The chat service answered ${response.status}.`
    try {
      const body = await response.json()
      if (body?.error || body?.message) message = body.error ?? body.message
    } catch {
      // Not JSON -- keep the status message.
    }
    throw new Error(message)
  }

  // A function deployed before this change answers in JSON however the
  // request was framed. The client and the function ship separately, so
  // that window is real, and falling back is cheaper than a broken chat
  // for however long it lasts.
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    const body = (await response.json()) as ChatReply
    if (body.type === 'error') throw new Error(body.message ?? 'Something went wrong.')
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
      if (event.type === 'error') throw new Error(event.message)
      onEvent(event)
    }
  }

  // `done` carries the authoritative text; the deltas are what was
  // shown while waiting, and they agree unless the stream was cut off.
  return finalText || streamedText
}
