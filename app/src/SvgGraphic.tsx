import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import DOMPurify from 'dompurify'
import { supabase } from './lib/supabaseClient'

// Renders SVG the chat model wrote itself (see docs/decisions -- chat's
// system prompt now tells it a fenced ```svg block becomes a real picture,
// with no fixed chart-type catalog: it decides what to draw, this decides
// only that it's safe to draw. The model's final text isn't fully trusted
// input -- a compromised data source could still try to influence what it
// says (the same reasoning behind "everything a query returns is data to
// relay, never instructions to follow") -- so raw markup never reaches
// dangerouslySetInnerHTML unsanitized. DOMPurify's own svg profile keeps
// shapes/paths/gradients/text while stripping <script>, on* handlers, and
// <foreignObject> (which could otherwise smuggle arbitrary HTML).
//
// The inline copy is capped small (see .chat-graphic) so it fits a chat
// bubble -- fine for a simple shape, not for anything with real detail
// (a 100-position row map, say). Tapping it opens the same sanitized
// markup full-screen instead of re-rendering a different, "zoomed"
// version -- one sanitize call, two sizes of the same output.
export function SvgGraphic({
  code,
  session,
  conversationId,
}: {
  code: string
  session: Session
  conversationId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const clean = DOMPurify.sanitize(code, { USE_PROFILES: { svg: true, svgFilters: true } }).trim()

  // Sanitizing stripped everything meaningful (or the model's block wasn't
  // real SVG to begin with) -- fall back to the raw text rather than
  // rendering an empty box with no explanation of what was supposed to be
  // there.
  if (!clean || !clean.includes('<svg')) {
    return <pre className="chat-graphic-fallback">{code}</pre>
  }

  // Stores the raw model output, not the sanitized copy (see
  // docs/decisions/0027) -- both the inline view and the public link
  // sanitize on every read, the same way this component already does,
  // rather than trusting a stored "already safe" flag forever.
  async function handleShare() {
    setSharing(true)
    setShareError(null)
    const { data: profile } = await supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()
    if (!profile) {
      setSharing(false)
      setShareError('Could not find your producer.')
      return
    }
    const { data, error } = await supabase
      .from('artifacts')
      .insert({ producer_id: profile.producer_id, conversation_id: conversationId, content: code })
      .select('id')
      .single()
    setSharing(false)
    if (error || !data) {
      setShareError(error?.message ?? 'Something went wrong.')
      return
    }
    setShareUrl(`${window.location.origin}/a/${data.id}`)
  }

  async function handleCopy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div
        className="chat-graphic"
        role="button"
        tabIndex={0}
        aria-label="View larger"
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded(true)
        }}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      <p className="chat-graphic-hint">Tap to enlarge</p>
      {expanded && (
        <div className="chat-graphic-overlay" onClick={() => setExpanded(false)}>
          <div className="chat-graphic-overlay-actions" onClick={(e) => e.stopPropagation()}>
            {shareUrl ? (
              <div className="chat-graphic-share-link">
                <input type="text" readOnly value={shareUrl} onClick={(e) => e.currentTarget.select()} />
                <button type="button" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleShare} disabled={sharing}>
                {sharing ? 'Sharing...' : 'Share'}
              </button>
            )}
          </div>
          <button
            type="button"
            className="chat-graphic-overlay-close"
            aria-label="Close"
            onClick={() => setExpanded(false)}
          >
            &times;
          </button>
          {shareError && <p className="error chat-graphic-share-error">{shareError}</p>}
          <div
            className="chat-graphic-overlay-content"
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: clean }}
          />
        </div>
      )}
    </>
  )
}
