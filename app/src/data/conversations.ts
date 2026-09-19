import type { Json } from '@/data/schema'
import type { ChatMessage } from '@/features/chat/types'
import { supabase } from '@/lib/supabaseClient'
import { unwrap, unwrapList } from '@/data/result'

// One row per chat session (0011): the client generates the id and
// upserts the whole transcript after each message, so a conversation
// shows up in history at whatever it was last logged as, with no
// server-side involvement -- not even from the chat Edge Function.

export type Conversation = {
  id: string
  mode: 'submit' | 'ask'
  transcript: ChatMessage[]
  updated_at: string
}

export async function listConversations(): Promise<Conversation[]> {
  const rows = unwrapList(
    await supabase
      .from('conversations')
      .select('id, mode, transcript, updated_at')
      .order('updated_at', { ascending: false }),
  )
  return rows as unknown as Conversation[]
}

// mode is always 'ask' now that chat-based observation submission is
// gone (superseded 0012). Kept as a column rather than dropped, because
// past sessions really did produce 'submit' rows.
export async function startConversation(
  id: string,
  producerId: string,
  transcript: ChatMessage[],
): Promise<void> {
  unwrap(
    await supabase.from('conversations').insert({
      id,
      producer_id: producerId,
      mode: 'ask',
      // The column is jsonb; the transcript is the app's own shape going
      // into it. This cast is the boundary between the two.
      transcript: transcript as unknown as Json,
    }),
  )
}

export async function updateConversation(id: string, transcript: ChatMessage[]): Promise<void> {
  unwrap(
    await supabase
      .from('conversations')
      .update({
        mode: 'ask',
        transcript: transcript as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id),
  )
}
