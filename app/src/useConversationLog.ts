import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import type { ChatMessage } from './chatTypes'

// One row per chat session (docs/decisions/0011): the client generates
// the id and upserts the full transcript after each message, so a
// conversation only ever shows up in history at whatever it last got
// logged as -- no server-side involvement, not even from the chat
// Edge Function.
//
// mode is always 'ask' now that chat-based observation submission is
// removed (superseded 0012) -- kept as a column rather than dropped since
// past sessions really did produce a 'submit' row.
export function useConversationLog(session: Session) {
  const [producerId, setProducerId] = useState<string | null>(null)
  const conversationId = useRef(crypto.randomUUID())
  const started = useRef(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProducerId(data?.producer_id ?? null))
  }, [session.user.id])

  async function log(transcript: ChatMessage[]) {
    if (!producerId || transcript.length === 0) return

    if (!started.current) {
      started.current = true
      await supabase.from('conversations').insert({
        id: conversationId.current,
        producer_id: producerId,
        mode: 'ask',
        transcript,
      })
      return
    }

    await supabase
      .from('conversations')
      .update({ mode: 'ask', transcript, updated_at: new Date().toISOString() })
      .eq('id', conversationId.current)
  }

  return { log }
}
