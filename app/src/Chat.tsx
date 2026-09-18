import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { canUseNativeCamera, pickPhoto, uploadPhoto, PHOTO_BUCKET } from './lib/photo'
import { PixelArrow, PixelCheck, PixelCloud, PixelGrid, PixelPicture, PixelSproutGrowth, PixelX } from './icons'
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
  const [pendingPhoto, setPendingPhoto] = useState<{ path: string; previewUrl: string } | null>(null)
  const [attaching, setAttaching] = useState(false)
  const { log, conversationId: loggedConversationId } = useConversationLog(
    session,
    conversationId ? { id: conversationId } : undefined,
  )
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

  // Uploading happens on attach, not on send, so the producer sees the
  // thumbnail and can back out before committing to a turn -- and so a
  // slow upload in a vineyard with one bar isn't sitting between them
  // and their message. The path is what the turn carries; the object is
  // already in storage by then.
  async function attachPhoto(source: 'camera' | 'library') {
    if (attaching || sending) return
    setError(null)
    setAttaching(true)
    try {
      const blob = await pickPhoto(source)
      if (!blob) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('producer_id')
        .eq('id', session.user.id)
        .single()
      if (!profile?.producer_id) {
        setError('Could not find your producer.')
        return
      }

      const path = await uploadPhoto(blob, profile.producer_id)
      setPendingPhoto((previous) => {
        if (previous) URL.revokeObjectURL(previous.previewUrl)
        return { path, previewUrl: URL.createObjectURL(blob) }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach that photo.')
    } finally {
      setAttaching(false)
    }
  }

  // Removing deletes the object rather than just forgetting the path.
  // An abandoned attach would otherwise leave a file in the bucket that
  // nothing references and nobody can see -- invisible cost, and a photo
  // of the producer's vineyard sitting around for no reason.
  async function removePendingPhoto() {
    if (!pendingPhoto) return
    URL.revokeObjectURL(pendingPhoto.previewUrl)
    const { path } = pendingPhoto
    setPendingPhoto(null)
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    if ((!input.trim() && !pendingPhoto) || sending) return

    // A photo with no words is a normal thing to send from a vineyard
    // row, so the turn carries a stand-in rather than an empty string --
    // the transcript stays readable, and the model still gets the image
    // as a real attachment alongside it.
    const text = input.trim() || (pendingPhoto ? 'I took a photo.' : '')
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    log(nextMessages)
    setInput('')
    setSending(true)
    setError(null)

    // Only role and content ever go to the function. ChatMessage also
    // carries `feedback` once someone gives a reply a thumbs up or down,
    // and that field reached the Anthropic API verbatim, which rejects
    // any key it doesn't know: "messages.1.feedback: Extra inputs are
    // not permitted", a 400 surfacing to the producer as "Edge Function
    // returned non-8xx status code". Because feedback is saved into the
    // stored transcript, a thumbed conversation stayed broken for good
    // -- reopening it from history and typing crashed the same way. The
    // function sanitizes its own input too (see chat/index.ts); doing it
    // here as well keeps the request honest about what it's actually
    // sending, rather than relying on the far end to clean up after us.
    // photoPath travels beside the messages, never inside them. The
    // function mints a signed URL and attaches the image to this one
    // outbound call; what gets stored in the transcript stays plain
    // text, so re-sending an old conversation can't drag an expired URL
    // or a megabyte of base64 along with it.
    const photoPath = pendingPhoto?.path ?? null
    setPendingPhoto(null)
    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        ...(photoPath ? { photoPath } : {}),
      },
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
                <MessageContent role={m.role} content={m.content} session={session} conversationId={loggedConversationId} />
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
                <PixelSproutGrowth size={20} />
              </div>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {/* Strip and form share one fixed container. The form used to be
          fixed on its own, so a sibling rendered before it still landed
          at the end of the flex column -- underneath the floating bar
          and half off the bottom of the screen, which is exactly what it
          did on a phone. Positioning the pair, not the bar, keeps them
          together whatever the strip's height turns out to be. */}
      <div className="chat-compose">
      {pendingPhoto && (
        <div className="chat-pending-photo">
          <img src={pendingPhoto.previewUrl} alt="Photo about to be sent" />
          <span>Attached. Send it with a question, or on its own.</span>
          <button type="button" onClick={removePendingPhoto} aria-label="Remove photo">
            <PixelX size={14} />
          </button>
        </div>
      )}
      <form className="chat-input" onSubmit={send}>
        {/* Native gets both, because a producer standing in a row wants
            the camera and one reviewing at a desk wants the library. On
            web a single button is right: the browser's own file dialog
            already offers the camera on a phone. */}
        <button
          type="button"
          className="icon-button"
          onClick={() => attachPhoto(canUseNativeCamera ? 'camera' : 'library')}
          disabled={attaching || sending}
          aria-label={canUseNativeCamera ? 'Take a photo' : 'Attach a photo'}
        >
          <PixelPicture size={18} />
        </button>
        {canUseNativeCamera && (
          <button
            type="button"
            className="icon-button"
            onClick={() => attachPhoto('library')}
            disabled={attaching || sending}
            aria-label="Choose a photo from your library"
          >
            <PixelGrid size={18} />
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pendingPhoto ? 'Add a question, or just send' : 'Ask a question'}
          aria-label="Ask a question about your vineyard"
        />
        <button
          type="submit"
          className="icon-button"
          disabled={sending || attaching || (!input.trim() && !pendingPhoto)}
          aria-label="Send"
        >
          <PixelArrow size={18} />
        </button>
      </form>
      </div>
    </div>
  )
}
