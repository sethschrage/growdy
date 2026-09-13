import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { PixelArrow, PixelThumbDown, PixelThumbUp } from './icons'
import { useConversationLog } from './useConversationLog'
import type { ChatMessage } from './chatTypes'

type Draft = {
  plot: string
  row_number: number
  position: number
  note: string
  observed_date: string | null
}

type PlantingMatch = { id: string; label: string | null }

export function ObservationChat({ session }: { session: Session }) {
  const [producerId, setProducerId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [match, setMatch] = useState<PlantingMatch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const { log, reset: resetConversation, conversationId } = useConversationLog(session, 'submit')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, draft])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProducerId(data?.producer_id ?? null))
  }, [session.user.id])

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || sending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input }]
    setMessages(nextMessages)
    log(nextMessages)
    setInput('')
    setSending(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('observation-chat', {
      body: { messages: nextMessages },
    })

    setSending(false)

    if (error) {
      setError(error.message)
      return
    }

    if (data.type === 'error') {
      setError(data.message)
      return
    }

    if (data.type === 'question') {
      const withAssistant = [...nextMessages, { role: 'assistant' as const, content: data.text }]
      setMessages(withAssistant)
      log(withAssistant)
      return
    }

    const { plot, row_number, position, note, observed_date } = data
    const { data: found, error: lookupError } = await supabase
      .from('planting_readable')
      .select('id, label')
      .ilike('plot', plot)
      .eq('row_number', row_number)
      .eq('position', position)

    if (lookupError) {
      setError(lookupError.message)
      return
    }

    if (!found || found.length !== 1) {
      const withAssistant = [
        ...nextMessages,
        {
          role: 'assistant' as const,
          content: `I couldn't find exactly one planting matching Plot ${plot}, Row ${row_number}, Position ${position} -- can you double check?`,
        },
      ]
      setMessages(withAssistant)
      log(withAssistant)
      return
    }

    setDraft({ plot, row_number, position, note, observed_date: observed_date ?? null })
    setMatch(found[0])
  }

  async function confirmSubmit() {
    if (!draft || !match || !producerId) return
    setSending(true)
    const { error } = await supabase.from('observations').insert({
      planting_id: match.id,
      producer_id: producerId,
      note: draft.note,
      observed_date: draft.observed_date,
      status: 'pending',
      conversation_id: conversationId.current,
    })
    setSending(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  function cancelDraft() {
    setDraft(null)
    setMatch(null)
  }

  function setFeedback(index: number, feedback: 'up' | 'down') {
    setMessages((prev) => {
      const updated = prev.map((m, i) =>
        i === index ? { ...m, feedback: m.feedback === feedback ? undefined : feedback } : m,
      )
      log(updated)
      return updated
    })
  }

  function resetChat() {
    setMessages([])
    setInput('')
    setDraft(null)
    setMatch(null)
    setError(null)
    setSubmitted(false)
    resetConversation()
  }

  if (submitted) {
    return (
      <div className="chat chat-submitted">
        <p>Submitted for review. Thank you.</p>
        <button type="button" onClick={resetChat}>
          Log another
        </button>
      </div>
    )
  }

  return (
    <div className="chat">
      <div className="chat-messages">
        <div className="chat-messages-inner">
          {messages.map((m, i) => (
            <div key={i} className={`chat-message-wrap chat-message-wrap--${m.role}`}>
              <p className={`chat-message chat-message-${m.role}`}>{m.content}</p>
              {m.role === 'assistant' && (
                <div className="feedback-row">
                  <button
                    type="button"
                    className={`feedback-button${m.feedback === 'up' ? ' feedback-button--selected' : ''}`}
                    aria-label="Good response"
                    aria-pressed={m.feedback === 'up'}
                    onClick={() => setFeedback(i, 'up')}
                  >
                    <PixelThumbUp size={14} />
                  </button>
                  <button
                    type="button"
                    className={`feedback-button feedback-button--down${m.feedback === 'down' ? ' feedback-button--selected' : ''}`}
                    aria-label="Bad response"
                    aria-pressed={m.feedback === 'down'}
                    onClick={() => setFeedback(i, 'down')}
                  >
                    <PixelThumbDown size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {error && <p className="error">{error}</p>}
          {draft && match && (
            <div className="chat-confirm">
              <p>
                Log this on{' '}
                {match.label ?? `Plot ${draft.plot}, Row ${draft.row_number}, Position ${draft.position}`}:
                {' '}"{draft.note}"?
              </p>
              <div className="chat-confirm-actions">
                <button type="button" onClick={confirmSubmit} disabled={sending}>
                  Confirm
                </button>
                <button type="button" onClick={cancelDraft}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {!draft && (
        <form className="chat-input" onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you observed..."
          />
          <button type="submit" className="icon-button" disabled={sending} aria-label="Send">
            <PixelArrow size={18} />
          </button>
        </form>
      )}
    </div>
  )
}
