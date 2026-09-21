import { useEffect, useState } from 'react'
import { listConversations, type Conversation } from '@/data/conversations'
import { MessageContent } from '@/features/chat/MessageContent'
import type { ChatMessage } from '@/features/chat/types'

export type { Conversation }

function firstPrompt(transcript: ChatMessage[]): string {
  return transcript.find((m) => m.role === 'user')?.content ?? '(empty conversation)'
}

// Plain text, not markdown -- readable in any text/markdown viewer without
// depending on this app's own rendering.
function toExportText(conversation: Conversation): string {
  const lines = conversation.transcript.map(
    (m) => `${m.role === 'user' ? 'You' : 'Growdy'}: ${m.content}`,
  )
  return lines.join('\n\n')
}

function exportConversation(conversation: Conversation) {
  const blob = new Blob([toExportText(conversation)], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `growdy-chat-${conversation.id.slice(0, 8)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// Mounted only while open (App.tsx renders it conditionally), so a fresh
// mount is what resets state on each open -- no imperative reset needed.
export function HistoryDrawer({
  onClose,
  onContinue,
}: {
  onClose: () => void
  onContinue: (conversation: Conversation) => void
}) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
  }, [])

  return (
    // No scrim to tap: this covers the screen like every other screen the
    // menu opens, and the way out is the same cross they all have. It was
    // a 90vw drawer over a dark overlay, which left a sliver of the app
    // down one edge and read as the screen being zoomed rather than
    // covered -- and the only way back was tapping that sliver, on an
    // overlay whose `onClick` was the same non-interactive-element click
    // that iOS does not reliably deliver. So the producer's own report:
    // "it takes over and the x can't be found".
    <div className="history-overlay">
      <div className="history-drawer">
        <div className="history-header">
          {selected ? (
            <button type="button" className="history-back" onClick={() => setSelected(null)}>
              &larr; Back
            </button>
          ) : (
            <h2 className="history-title">History</h2>
          )}
          {/* Always here, in both views, in the place every other screen
              puts it. */}
          <button type="button" onClick={onClose} aria-label="Close" className="history-close">
            &times;
          </button>
        </div>
        <div className="history-body">
        {selected ? (
          <>
            <div className="history-detail-actions">
              <button type="button" onClick={() => onContinue(selected)}>
                Continue this chat
              </button>
              <button type="button" className="history-export" onClick={() => exportConversation(selected)}>
                Export
              </button>
            </div>
            <div className="history-detail-messages">
              {selected.transcript.map((m, i) => (
                <div key={i} className={`chat-message-wrap chat-message-wrap--${m.role}`}>
                  <div className={`chat-message chat-message-${m.role}`}>
                    <MessageContent role={m.role} content={m.content} conversationId={selected.id} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
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
    </div>
  )
}
