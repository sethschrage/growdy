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
  const lastAssistantRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // A reply that's longer than the screen used to land with its own
    // *end* in view (scrollIntoView always targeted the bottom sentinel),
    // skipping straight past the part of the answer someone would
    // actually read first. Once a reply has actually landed (not just the
    // "thinking" placeholder), scroll its own top into view instead --
    // sending a message or waiting still scrolls to the bottom sentinel,
    // same as before.
    const lastMessage = messages[messages.length - 1]
    const scroll = () => {
      if (!sending && lastMessage?.role === 'assistant') {
        lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
    scroll()
    // Two independent things can shift layout shortly after this first
    // scroll fires, landing the "top" of the message somewhere that isn't
    // actually the top by the time everything settles: iOS Safari's own
    // chrome (address/tab bar) can collapse or expand right around now
    // (e.g. after the keyboard dismisses on send) -- and separately, the
    // pixel-art display font loads with `display=swap`, so text first
    // renders in a fallback font and reflows once the real one arrives,
    // changing line heights. A fixed-delay pass catches the first; waiting
    // on the font itself catches the second regardless of how long it
    // actually takes to load.
    let cancelled = false
    const correction = setTimeout(scroll, 400)
    document.fonts?.ready.then(() => {
      if (!cancelled) scroll()
    })
    return () => {
      cancelled = true
      clearTimeout(correction)
    }
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
      console.error('chat function invoke failed', error)
      let message = error.message
      try {
        const body = await error.context.json()
        if (body?.error) message = body.error
      } catch {
        // error.context wasn't a JSON response -- fall back to error.message
      }
      setError(message)
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
            <div
              key={i}
              ref={i === messages.length - 1 && m.role === 'assistant' ? lastAssistantRef : undefined}
              className={`chat-message-wrap chat-message-wrap--${m.role}`}
            >
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
                    <PixelCheck size={18} />
                  </button>
                  <button
                    type="button"
                    className={`feedback-button feedback-button--down${m.feedback === 'down' ? ' feedback-button--selected' : ''}`}
                    aria-label="Bad response"
                    aria-pressed={m.feedback === 'down'}
                    onClick={() => setFeedback(i, 'down')}
                  >
                    <PixelX size={18} />
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
