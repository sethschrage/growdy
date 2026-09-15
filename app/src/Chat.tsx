import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { PixelArrow, PixelCheck, PixelCloud, PixelX } from './icons'
import { MessageContent } from './MessageContent'
import { useConversationLog } from './useConversationLog'
import type { ChatMessage } from './chatTypes'

export function Chat({
  session,
  initialMessages,
  conversationId,
}: {
  session: Session
  initialMessages?: ChatMessage[]
  conversationId?: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? [])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { log } = useConversationLog(session, conversationId ? { id: conversationId } : undefined)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || sending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input }]
    setMessages(nextMessages)
    log(nextMessages)
    setInput('')
    setSending(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('chat', {
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

    const withAssistant = [...nextMessages, { role: 'assistant' as const, content: data.text ?? '' }]
    setMessages(withAssistant)
    log(withAssistant)
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

  return (
    <div className="chat">
      <PixelCloud width={80} top="6%" left="10%" duration="9s" />
      <PixelCloud width={64} top="14%" left="66%" duration="7s" />
      <div className="star" style={{ top: '4%', left: '40%', animationDelay: '0s' }} />
      <div className="star" style={{ top: '10%', left: '82%', animationDelay: '1s' }} />
      <div className="chat-messages">
        <div className="chat-messages-inner">
          {messages.map((m, i) => (
            <div key={i} className={`chat-message-wrap chat-message-wrap--${m.role}`}>
              <div className={`chat-message chat-message-${m.role}`}>
                <MessageContent role={m.role} content={m.content} />
              </div>
              {m.role === 'assistant' && (
                <div className="feedback-row">
                  <button
                    type="button"
                    className={`feedback-button${m.feedback === 'up' ? ' feedback-button--selected' : ''}`}
                    aria-label="Good response"
                    aria-pressed={m.feedback === 'up'}
                    onClick={() => setFeedback(i, 'up')}
                  >
                    <PixelCheck size={14} />
                  </button>
                  <button
                    type="button"
                    className={`feedback-button feedback-button--down${m.feedback === 'down' ? ' feedback-button--selected' : ''}`}
                    aria-label="Bad response"
                    aria-pressed={m.feedback === 'down'}
                    onClick={() => setFeedback(i, 'down')}
                  >
                    <PixelX size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="chat-message-wrap chat-message-wrap--assistant">
              <div className="chat-message chat-message-assistant chat-thinking" aria-live="polite" aria-label="Thinking">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question"
          aria-label="Ask a question about your vineyard"
        />
        <button type="submit" className="icon-button" disabled={sending} aria-label="Send">
          <PixelArrow size={18} />
        </button>
      </form>
    </div>
  )
}
