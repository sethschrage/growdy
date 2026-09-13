import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import type { ChatMessage } from './chatTypes'

type Conversation = {
  id: string
  mode: 'submit' | 'ask'
  transcript: ChatMessage[]
  updated_at: string
}

function firstPrompt(transcript: ChatMessage[]): string {
  return transcript.find((m) => m.role === 'user')?.content ?? '(empty conversation)'
}

// Mounted only while open (App.tsx renders it conditionally), so a fresh
// mount is what resets state on each open -- no imperative reset needed.
export function HistoryDrawer({ session: _session, onClose }: { session: Session; onClose: () => void }) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)

  useEffect(() => {
    supabase
      .from('conversations')
      .select('id, mode, transcript, updated_at')
      .order('updated_at', { ascending: false })
      .then(({ data }) => setConversations((data as Conversation[]) ?? []))
  }, [])

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-drawer" onClick={(e) => e.stopPropagation()}>
        {selected ? (
          <>
            <button type="button" className="history-back" onClick={() => setSelected(null)}>
              &larr; Back
            </button>
            <div className="history-detail-messages">
              {selected.transcript.map((m, i) => (
                <div key={i} className={`chat-message-wrap chat-message-wrap--${m.role}`}>
                  <p className={`chat-message chat-message-${m.role}`}>{m.content}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="history-title">History</h2>
            {conversations === null && <p className="history-empty">Loading...</p>}
            {conversations?.length === 0 && <p className="history-empty">Nothing logged yet.</p>}
            <ul className="history-list">
              {conversations?.map((c) => (
                <li key={c.id}>
                  <button type="button" className="history-item" onClick={() => setSelected(c)}>
                    <span className={`history-circle history-circle--${c.mode}`} aria-hidden="true" />
                    <span className="history-item-text">{firstPrompt(c.transcript)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
