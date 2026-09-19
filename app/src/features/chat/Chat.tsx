import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchProducerId } from '@/data/profile'
import {
  canUseNativeCamera,
  currentLocation,
  deletePhoto,
  pickPhoto,
  uploadPhoto,
  type PhotoLocation,
} from '@/lib/photo'
import { sendChatMessage } from '@/data/chat'
import { exifObservedDate } from '@/lib/exif'
import { ArrowIcon, CameraIcon, CheckIcon, CloseIcon, PictureIcon } from '@/ui/icons'
import { PixelCloud, PixelSproutGrowth } from '@/ui/pixelArt'
import { MessageContent } from '@/features/chat/MessageContent'
import { useConversationLog } from '@/features/chat/useConversationLog'
import type { ChatMessage } from '@/features/chat/types'

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
  const [pendingPhoto, setPendingPhoto] = useState<{
    path: string
    previewUrl: string
    takenOn: string | null
    location: PhotoLocation | null
    source: 'camera' | 'library'
  } | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  // What is known about each photo attached in this session, keyed by
  // storage path: where it was taken and when. Neither travels through
  // the model -- a position is a fact about the capture rather than
  // something to infer from an image, and the date is read from EXIF --
  // so this is how the card gets them at the moment it files a candidate.
  const photoMetaRef = useRef(new Map<string, { location: PhotoLocation | null; takenOn: string | null }>())
  // The most recent photo attached in this conversation, held until
  // another one replaces it.
  //
  // The model sees a photo's storage path exactly once: the chat function
  // appends it to the turn the image rides on, and that content block is
  // built per request and discarded. What gets stored in the transcript
  // is only what the producer typed, so on any later turn the path is not
  // in the model's context at all -- it cannot carry forward something it
  // can no longer see. An observation argued over for a few turns
  // therefore arrived with no photo attached, which is precisely the
  // case where the evidence is worth having.
  //
  // So the client keeps it. The model's own photo_path still wins when it
  // has one; this only fills the gap, and only with the photo actually
  // being discussed.
  const [lastPhotoPath, setLastPhotoPath] = useState<string | null>(null)
  const { log, conversationId: loggedConversationId } = useConversationLog(
    session,
    conversationId ? { id: conversationId } : undefined,
  )
  const messagesRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLDivElement>(null)

  // The compose bar floats over the messages, so the scroll area has to
  // reserve exactly as much room as the bar actually occupies. That used
  // to be a hardcoded 90px, which was already ~12px short on a phone
  // with a home indicator (6px offset + ~34px safe area + ~62px bar) and
  // became badly wrong once an attached photo added a strip on top --
  // the tail of a reply, and its feedback buttons, ended up behind the
  // bar with no way to scroll to them. Measuring it means the strip
  // appearing or disappearing can't leave anything unreachable.
  useEffect(() => {
    const node = composeRef.current
    if (!node) return
    const apply = () => {
      node.style.setProperty('--compose-height', `${node.offsetHeight}px`)
      node.parentElement?.style.setProperty('--compose-height', `${node.offsetHeight}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Whether the view was pinned to the bottom when the last update
  // arrived. Auto-scrolling unconditionally is what made the chat
  // impossible to read while it was thinking: the effect below re-runs on
  // a 400ms timer and again when the font loads, so scrolling up to
  // re-read the previous reply got undone twice, which reads as "scroll
  // doesn't work" rather than as a scroll that worked and was reverted.
  const pinnedToBottomRef = useRef(true)

  // True from the moment a finger lands until a moment after it lifts.
  // Pinning alone wasn't enough: a producer dragging *within* the bottom
  // 120px is still pinned, so a correction firing mid-gesture had every
  // right to scroll -- and on iOS a programmatic smooth scroll doesn't
  // yield to a touch that arrives while it's running, it finishes and
  // puts the view back. From the thumb's side that is a scroll area that
  // resists and then goes dead, which is what "it sort of freezes"
  // describes. Nothing scrolls the conversation while someone is
  // scrolling it themselves.
  const touchingRef = useRef(false)

  useEffect(() => {
    const node = messagesRef.current
    if (!node) return
    const onScroll = () => {
      // 120px of slack: a producer who is essentially at the bottom still
      // wants new content to follow, and an exact comparison would fail
      // on fractional scroll heights anyway.
      pinnedToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120
    }
    // The release timer covers momentum: the finger is gone but the
    // scroller is still moving, and a correction landing in that window
    // fights the flick just as visibly as one landing on the drag.
    let release: ReturnType<typeof setTimeout> | undefined
    const onStart = () => {
      clearTimeout(release)
      touchingRef.current = true
    }
    const onEnd = () => {
      clearTimeout(release)
      release = setTimeout(() => (touchingRef.current = false), 600)
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('wheel', onStart, { passive: true })
    node.addEventListener('touchend', onEnd, { passive: true })
    node.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      clearTimeout(release)
      node.removeEventListener('scroll', onScroll)
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('wheel', onStart)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  useEffect(() => {
    // A reply that's longer than the screen used to land with its own
    // *end* in view (scrollIntoView always targeted the bottom sentinel),
    // skipping straight past the part of the answer someone would
    // actually read first. Once a reply has actually landed (not just the
    // "thinking" placeholder), scroll its own top into view instead --
    // sending a message or waiting still scrolls to the bottom sentinel,
    // same as before.
    const lastMessage = messages[messages.length - 1]
    const scroll = (behavior: ScrollBehavior) => {
      // Scrolled up to read something, or scrolling right now? Leave it
      // alone. The corrections below exist to fix a layout that shifted
      // underneath an auto-scroll, not to drag the view back from where
      // someone put it.
      if (!pinnedToBottomRef.current || touchingRef.current) return
      if (!sending && lastMessage?.role === 'assistant') {
        lastAssistantRef.current?.scrollIntoView({ behavior, block: 'start' })
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior })
      }
    }
    scroll('smooth')
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
    //
    // The corrections jump rather than animate. They are repairing a
    // view that has already settled, and a second smooth animation
    // starting on top of a finished one is a half-second during which
    // the conversation is moving for no reason a producer can see.
    let cancelled = false
    const correction = setTimeout(() => scroll('auto'), 400)
    document.fonts?.ready.then(() => {
      if (!cancelled) scroll('auto')
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
    setPhotoMenuOpen(false)
    setError(null)
    setAttaching(true)
    try {
      const picked = await pickPhoto(source)
      if (!picked) return

      const producerId = await fetchProducerId(session.user.id)
      if (!producerId) {
        setError('Could not find your producer.')
        return
      }

      const path = await uploadPhoto(picked.blob, producerId, picked.exif)
      // The day the shutter fired, not the day it was uploaded. Only
      // ever different for a photo picked out of the library, which is
      // exactly the case where guessing gets it wrong and nobody
      // notices.
      const takenOn = exifObservedDate(picked.exif?.dateTimeOriginal)
      photoMetaRef.current.set(path, { location: picked.location, takenOn })
      setLastPhotoPath(path)
      setPendingPhoto((previous) => {
        if (previous) URL.revokeObjectURL(previous.previewUrl)
        return { path, previewUrl: URL.createObjectURL(picked.blob), takenOn, location: picked.location, source }
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
    await deletePhoto(path)
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    if ((!input.trim() && !pendingPhoto) || sending) return

    // A photo with no words is a normal thing to send from a vineyard
    // row, so the turn carries a stand-in rather than an empty string --
    // the transcript stays readable, and the model still gets the image
    // as a real attachment alongside it.
    // Sending is the producer's own action, so the view follows it even
    // if they had scrolled up to check something first.
    pinnedToBottomRef.current = true
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
    const photoTakenOn = pendingPhoto?.takenOn ?? null
    const photoWasCaptured = pendingPhoto?.source === 'camera'
    setPendingPhoto(null)

    // The position is taken here, at send, and the compose bar says so --
    // which is what makes it worth a producer's while to photograph a
    // vine and then walk to the spot they actually want on the map before
    // sending. Awaited rather than fired off, because a point that
    // arrives after the candidate is filed belongs to nothing.
    if (photoPath && photoWasCaptured) {
      const here = await currentLocation()
      if (here) {
        const existing = photoMetaRef.current.get(photoPath)
        photoMetaRef.current.set(photoPath, { location: here, takenOn: existing?.takenOn ?? null })
      }
    }
    let data
    try {
      data = await sendChatMessage({ messages: nextMessages, photoPath, photoTakenOn })
    } catch (e) {
      setSending(false)
      setError(e instanceof Error ? e.message : 'Could not reach growdy.')
      return
    }
    setSending(false)

    if (data.type === 'error') {
      setError(data.message ?? 'Something went wrong.')
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
      <div className="chat-messages" ref={messagesRef}>
        <div className="chat-messages-inner">
          {messages.map((m, i) => (
            <div
              key={i}
              ref={i === messages.length - 1 && m.role === 'assistant' ? lastAssistantRef : undefined}
              className={`chat-message-wrap chat-message-wrap--${m.role}`}
            >
              <div className={`chat-message chat-message-${m.role}`}>
                <MessageContent
                  role={m.role}
                  content={m.content}
                  session={session}
                  conversationId={loggedConversationId}
                  photoMetaFor={(path) => photoMetaRef.current.get(path) ?? null}
                  lastPhotoPath={lastPhotoPath}
                />
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
                    <CheckIcon size={18} />
                  </button>
                  <button
                    type="button"
                    className={`feedback-button feedback-button--down${m.feedback === 'down' ? ' feedback-button--selected' : ''}`}
                    aria-label="Bad response"
                    aria-pressed={m.feedback === 'down'}
                    onClick={() => setFeedback(i, 'down')}
                  >
                    <CloseIcon size={18} />
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
      <div className="chat-compose" ref={composeRef}>
      {photoMenuOpen && canUseNativeCamera && (
        <div className="chat-photo-menu">
          <button type="button" onClick={() => attachPhoto('camera')}>
            <CameraIcon size={18} /> Take a photo
          </button>
          <button type="button" onClick={() => attachPhoto('library')}>
            <PictureIcon size={18} /> Choose from library
          </button>
        </div>
      )}
      {pendingPhoto && (
        <div className="chat-pending-photo">
          <img src={pendingPhoto.previewUrl} alt="Photo about to be sent" />
          <span>
            {pendingPhoto.takenOn
              ? `Attached, taken ${pendingPhoto.takenOn}.`
              : 'Attached.'}
            {pendingPhoto.source === 'camera' && (
              // Worth saying plainly, because it changes what a producer
              // does next: the point recorded is where they are standing
              // when they send, not where they were when they pressed the
              // shutter. Knowing that makes walking to the vine worth
              // doing.
              <strong className="chat-pending-photo-location">
                {' '}Your location when you send is what gets recorded — stand where you want it
                marked.
              </strong>
            )}
          </span>
          <button type="button" onClick={removePendingPhoto} aria-label="Remove photo">
            <CloseIcon size={14} />
          </button>
        </div>
      )}
      <form className="chat-input" onSubmit={send}>
        {/* One button, not two. Camera and library are the same intent --
            attach a photo -- and the compose row has to leave room for
            the buttons that come after this one. On web there is nothing
            to choose between: the browser's own file dialog already
            offers the camera on a phone. */}
        <button
          type="button"
          className="icon-button"
          onClick={() => (canUseNativeCamera ? setPhotoMenuOpen((open) => !open) : attachPhoto('library'))}
          disabled={attaching || sending}
          aria-label="Attach a photo"
          aria-expanded={canUseNativeCamera ? photoMenuOpen : undefined}
        >
          <CameraIcon size={18} />
        </button>
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
          <ArrowIcon size={18} />
        </button>
      </form>
      </div>
    </div>
  )
}
