import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { startConversation, updateConversation } from '@/data/conversations'
import { fetchProducerId } from '@/data/profile'
import type { ChatMessage } from '@/features/chat/types'

// One row per chat session (docs/decisions/0011): the client generates
// the id and upserts the full transcript after each message, so a
// conversation only ever shows up in history at whatever it last got
// logged as -- no server-side involvement, not even from the chat
// Edge Function.
//
// mode is always 'ask' now that chat-based observation submission is
// removed (superseded 0012) -- kept as a column rather than dropped since
// past sessions really did produce a 'submit' row.
//
// `existing` is set when the chat was opened from History to continue a
// past conversation: reuse its id and skip straight to the update branch
// below, since the row is already there -- inserting again would collide
// on the primary key.
export function useConversationLog(session: Session, existing?: { id: string }) {
  const [producerId, setProducerId] = useState<string | null>(null)
  // A lazy useState initializer, not a ref: the id never changes after
  // mount, but returning it (so a card rendered inside a message can log
  // what it does against this conversation) means it has to be safe to
  // read during render -- a ref's .current isn't.
  const [conversationId] = useState(() => existing?.id ?? crypto.randomUUID())
  const started = useRef(Boolean(existing))

  useEffect(() => {
    fetchProducerId(session.user.id)
      .then(setProducerId)
      .catch(() => setProducerId(null))
  }, [session.user.id])

  async function log(transcript: ChatMessage[]) {
    if (!producerId || transcript.length === 0) return

    if (!started.current) {
      // Marked started only once the row exists. Setting it first meant
      // that a failed create -- no signal, most likely -- left every
      // later write updating a conversation that was never there, so one
      // missed turn took the whole transcript with it.
      await startConversation(conversationId, producerId, transcript)
      started.current = true
      return
    }

    await updateConversation(conversationId, transcript)
  }

  return { log, conversationId }
}
