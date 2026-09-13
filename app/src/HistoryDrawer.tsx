import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
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
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
        <h2 className="history-title">History</h2>
        {conversations === null && <p className="history-empty">Loading...</p>}
        {conversations?.length === 0 && <p className="history-empty">Nothing logged yet.</p>}
        <ul className="history-list">
          {conversations?.map((c) => (
            <li key={c.id} className="history-item">
              <button
                type="button"
                className={`history-circle history-circle--${c.mode}`}
                aria-label={c.mode === 'submit' ? 'Observation chat' : 'Question chat'}
                aria-expanded={expandedId === c.id}
                onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
              />
              {expandedId === c.id && <p className="history-preview">{firstPrompt(c.transcript)}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
