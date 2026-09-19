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
