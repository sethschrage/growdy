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
import { streamChatMessage } from '@/data/chat'
import { exifObservedDate } from '@/lib/exif'
import { ArrowIcon, CameraIcon, CheckIcon, CloseIcon, PictureIcon } from '@/ui/icons'
import { PixelCloud } from '@/ui/pixelArt'
import { onKeyboardInset } from '@/lib/keyboard'
import { describeSendFailure, onBackOnline } from '@/lib/connectivity'
import { AnswerMeta } from '@/features/chat/AnswerMeta'
import { estimateThinkingCostUsd } from '@/features/chat/cost'
import { ThinkingStatus } from '@/features/chat/ThinkingStatus'
import { IDLE_THINKING, reduceThinking, type ThinkingState } from '@/features/chat/thinking'
import { MessageContent } from '@/features/chat/MessageContent'
import { useConversationLog } from '@/features/chat/useConversationLog'
import type { ChatMessage } from '@/features/chat/types'

/**
 * How far the conversation has to be pulled before it counts as a
 * request about the keyboard -- down to put it away, up to ask for it
 * back. Far enough to be a decision: a flick in either direction often
 * starts with a few pixels the other way, and acting on that would take
 * the keyboard from somebody mid-sentence.
 */
const PULL = 40

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
  // What the reply looks like while it is still arriving, and what the
  // app is doing to produce it. Both come off the stream; neither is a
  // guess about how long something usually takes.
  const [streamingText, setStreamingText] = useState('')
  const [thinking, setThinking] = useState<ThinkingState>(IDLE_THINKING)
  // A send that did not arrive. Held whole -- the transcript it belongs
  // to and the photo that travelled with it -- so trying again is the
  // same request rather than a reconstruction of it.
  const [unsent, setUnsent] = useState<{
    messages: ChatMessage[]
    photoPath: string | null
    photoTakenOn: string | null
  } | null>(null)
  const [sendingSince, setSendingSince] = useState(0)
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
  const inputRef = useRef<HTMLInputElement>(null)

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

  // The keyboard covers the bottom of a conversation that no longer
  // shrinks to make room. Scrolling by the same number keeps the last
  // message where it was on screen.
  //
  // Only for somebody who was already at the bottom. Someone reading
  // back through history asked to be where they are, and yanking them
  // forward because a keyboard appeared would be the app taking the
  // conversation off them.
  useEffect(
    () =>
      onKeyboardInset((inset) => {
        const node = messagesRef.current
        if (!node || inset <= 0 || !pinnedToBottomRef.current) return
        node.scrollTop += inset
      }),
    [],
  )

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
    // Pulling the conversation down puts the keyboard away.
    //
    // The keyboard takes half the screen, and the way to get rid of it
    // was to send something or find somewhere neutral to tap. Reaching
    // for the conversation is the natural move -- it is what a thumb
    // does in every other messaging app -- and it did nothing here.
    //
    // A deliberate pull, not any movement: 40px, so that the small
    // downward drift at the start of an upward flick does not dismiss
    // the keyboard somebody is still typing into. Downward only, for the
    // same reason -- scrolling up to re-read is not a request to close
    // anything.
    //
    // Both directions, and both decided when the finger lifts.
    //
    // The first version acted on touchmove and worked on the simulator
    // and not on a phone, which is the same lesson this file keeps
    // learning: once iOS hands a gesture to the native scroller it stops
    // delivering touchmove to the page. On a real drag the events arrive
    // for a few pixels and then stop, so a threshold of 40 was never
    // reached and nothing happened. Synthetic touches never trigger that
    // handoff, which is why it looked fine here.
    //
    // touchend always arrives, and it is a user gesture, which is what
    // iOS requires before it will raise a keyboard for a focus the page
    // asked for. So the moves only accumulate how far the finger got,
    // and the lift decides.
    //
    // Dismissing keeps a fast path on touchmove as well: blur needs no
    // gesture, so when the events do arrive the keyboard goes at once
    // rather than on the lift.
    let pullFrom: number | null = null
    let startedAtBottom = false
    let furthestUp = 0
    let furthestDown = 0

    const atBottom = () => {
      const slack = Number.parseFloat(getComputedStyle(node).getPropertyValue('--scroll-slack')) || 0
      return node.scrollHeight - node.scrollTop - node.clientHeight <= slack + 1
    }

    const onTouchStart = (event: TouchEvent) => {
      pullFrom = event.touches[0]?.clientY ?? null
      furthestUp = 0
      furthestDown = 0
      // Read before the drag scrolls anything: the question is whether
      // they were at the end of the conversation when they started, not
      // where the rubber band left them.
      startedAtBottom = atBottom()
    }

    // Deliberately called from two places. On this phone a drag is
    // handed to the native scroller part way through and touchmove stops
    // being delivered, so the move alone missed the threshold and
    // nothing happened -- that is the bug this is fixing. touchend always
    // arrives. Running it twice is harmless.
    const settlePull = () => {
      const field = inputRef.current
      if (!field || pullFrom === null) return
      const focused = document.activeElement === field
      if (furthestDown >= PULL && focused) field.blur()
      else if (furthestUp >= PULL && startedAtBottom && !focused) field.focus()
    }

    const onTouchMove = (event: TouchEvent) => {
      if (pullFrom === null) return
      const y = event.touches[0]?.clientY
      if (y === undefined) return
      furthestDown = Math.max(furthestDown, y - pullFrom)
      furthestUp = Math.max(furthestUp, pullFrom - y)
      // Act here when the events are still arriving: it is the more
      // responsive of the two, and the keyboard moves under the finger
      // rather than after it lifts. settlePull repeats the decision on
      // touchend for the case where they stop arriving, and both are
      // idempotent -- a field already focused is not focused twice.
      settlePull()
    }

    const endPull = () => {
      settlePull()
      pullFrom = null
    }

    // A cancelled gesture is not a decision -- the system took the touch
    // away, which is not the same as a finger being lifted.
    const abandonPull = () => {
      pullFrom = null
    }

    node.addEventListener('scroll', onScroll, { passive: true })
    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchmove', onTouchMove, { passive: true })
    node.addEventListener('wheel', onStart, { passive: true })
    node.addEventListener('touchend', onEnd, { passive: true })
    node.addEventListener('touchend', endPull, { passive: true })
    node.addEventListener('touchcancel', onEnd, { passive: true })
    node.addEventListener('touchcancel', abandonPull, { passive: true })
    return () => {
      clearTimeout(release)
      node.removeEventListener('scroll', onScroll)
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('wheel', onStart)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchend', endPull)
      node.removeEventListener('touchcancel', onEnd)
      node.removeEventListener('touchcancel', abandonPull)
    }
  }, [])

  /**
   * The bottom of the list carries a band of empty space that exists
   * only so the view has something to rubber-band against on a phone --
   * without it a conversation that fits is dead under a thumb. It is
   * space to bounce into, not space to scroll to.
   *
   * The auto-scroll above cannot tell the difference: on a conversation
   * that already fits there is nothing to bring into view, so
   * scrollIntoView runs as far as it can, which is straight to the end
   * of the slack. That put the producer's own question under the header
   * and opened a void above the compose bar on a chat that needed no
   * scrolling at all -- "scroll is still broken and weird even though
   * the message technically fits".
   *
   * So the band is measured back out of the stylesheet that declares it,
   * rather than duplicated here, and the view is pulled out of it.
   */
  function keepOutOfTheSlack() {
    const node = messagesRef.current
    if (!node) return
    const slack = Number.parseFloat(getComputedStyle(node).getPropertyValue('--scroll-slack')) || 0
    const furthestUseful = Math.max(0, node.scrollHeight - node.clientHeight - slack)
    if (node.scrollTop > furthestUseful) node.scrollTop = furthestUseful
  }

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
      keepOutOfTheSlack()
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

  // A producer who has put the phone back in their pocket should not
  // have to take it out again. The browser tells us when it thinks the
  // connection is back; that belief is occasionally optimistic, which
  // costs one failed request and leaves the retry button where it was.
  // Held in a ref because `deliver` is rebuilt every render and the
  // listener should not be: subscribing on each keystroke would work and
  // would be silly.
  const deliverRef = useRef(deliver)
  useEffect(() => {
    deliverRef.current = deliver
  })

  useEffect(() => {
    if (!unsent || sending) return
    return onBackOnline(() => {
      void deliverRef.current(unsent.messages, unsent.photoPath, unsent.photoTakenOn)
    })
  }, [unsent, sending])

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
    // Not awaited, and allowed to fail: with no signal this cannot
    // write, and the next turn logs the whole transcript again anyway,
    // so a missed write heals itself rather than needing its own retry.
    log(nextMessages).catch(() => {})
    setInput('')

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
    await deliver(nextMessages, photoPath, photoTakenOn)
  }

  /**
   * One attempt at getting an answer. Separate from `send` because the
   * second attempt has to be the same request: the same transcript, the
   * same photo, no retyping. A producer in a block with no signal should
   * put the phone away and have the question go when the signal does.
   */
  async function deliver(
    nextMessages: ChatMessage[],
    photoPath: string | null,
    photoTakenOn: string | null,
  ) {
    setSending(true)
    setStreamingText('')
    setThinking(IDLE_THINKING)
    setSendingSince(Date.now())
    setError(null)

    let answer: string
    // Folded here as well as into state, because what the answer looked
    // at and what it cost outlive the status line: that unmounts the
    // moment the answer lands, and the numbers went with it.
    let tally = IDLE_THINKING
    try {
      answer = await streamChatMessage({ messages: nextMessages, photoPath, photoTakenOn }, (event) => {
        tally = reduceThinking(tally, event)
        setThinking(tally)
        if (event.type === 'text') setStreamingText((previous) => previous + event.text)
      })
    } catch (e) {
      setSending(false)
      setStreamingText('')
      setError(describeSendFailure(e))
      setUnsent({ messages: nextMessages, photoPath, photoTakenOn })
      return
    }
    setUnsent(null)
    setSending(false)
    setStreamingText('')

    const counted = tally.inputTokens + tally.outputTokens
    const withAssistant = [
      ...nextMessages,
      {
        role: 'assistant' as const,
        content: answer,
        ...(tally.sources.length > 0 ? { sources: tally.sources } : {}),
        ...(counted > 0
          ? {
              tokens: {
                total: counted,
                cached: tally.cachedTokens,
                cost: estimateThinkingCostUsd(tally),
              },
            }
          : {}),
      },
    ]
    setMessages(withAssistant)
    log(withAssistant).catch(() => {})
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
              {m.role === 'assistant' && <AnswerMeta sources={m.sources} tokens={m.tokens} />}
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
              {/* The answer occupies its real bubble while it arrives,
                  so nothing jumps when it finishes -- the status line
                  sits under it and disappears, rather than a placeholder
                  being replaced by a message. */}
              {streamingText && (
                <div className="chat-message chat-message-assistant">
                  <MessageContent
                    role="assistant"
                    content={streamingText}
                    session={session}
                    conversationId={loggedConversationId}
                    photoMetaFor={(path) => photoMetaRef.current.get(path) ?? null}
                    lastPhotoPath={lastPhotoPath}
                  />
                </div>
              )}
              <ThinkingStatus key={sendingSince} state={thinking} since={sendingSince} />
            </div>
          )}
          {error && (
            <div className="send-failed">
              <p className="error">{error}</p>
              {/* The question is still in the transcript above; this
                  sends that same one again rather than asking the
                  producer to type it a second time. */}
              {unsent && !sending && (
                <button
                  type="button"
                  className="send-failed-retry"
                  onClick={() => void deliver(unsent.messages, unsent.photoPath, unsent.photoTakenOn)}
                >
                  Try again
                </button>
              )}
            </div>
          )}
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
      {/* Tapping the box anywhere puts the cursor in it.
          The field fills the row's content box, but the row is a pill
          with padding and a border, and the two buttons are separated
          from it by a gap -- so several millimetres of what plainly
          looks like the chat box did nothing at all when tapped. A miss
          like that does not read as "I missed", it reads as the app
          ignoring you, which is what "the tap zone seems small and
          unresponsive" is describing.
          pointerdown rather than click, for the reason the menu's
          dismiss learned: a tap on something that is not natively
          interactive does not reliably produce a click on iOS. And it is
          a real user gesture, which is what iOS requires before it will
          bring the keyboard up for a programmatic focus. */}
      <div className="chat-compose-row">
        {/* Outside the capsule, on its own, the way the phone's own
            message bar puts it there. It was the left end of a single
            bordered box holding everything; a round button beside a
            capsule reads as "and also this", which is what it is -- the
            attachment, not part of typing. */}
        <button
          type="button"
          className="chat-extras"
          onClick={() => (canUseNativeCamera ? setPhotoMenuOpen((open) => !open) : attachPhoto('library'))}
          disabled={attaching || sending}
          aria-label="Attach a photo"
          aria-expanded={canUseNativeCamera ? photoMenuOpen : undefined}
        >
          <CameraIcon size={20} />
        </button>
      <form
        className="chat-input"
        onSubmit={send}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button, input')) return
          inputRef.current?.focus()
        }}
      >
        {/* Prose about a vineyard, so capitalisation and autocorrect stay
            on -- unlike the identifier fields elsewhere in the app. Only
            the Return key is labelled: it already submits the form, and
            "send" says so. */}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pendingPhoto ? 'Add a question, or just send' : 'Ask a question'}
          aria-label="Ask a question about your vineyard"
          enterKeyHint="send"
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
    </div>
  )
}
