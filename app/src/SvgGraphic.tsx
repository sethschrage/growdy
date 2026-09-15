import { useState } from 'react'
import DOMPurify from 'dompurify'

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
export function SvgGraphic({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false)
  const clean = DOMPurify.sanitize(code, { USE_PROFILES: { svg: true, svgFilters: true } }).trim()

  // Sanitizing stripped everything meaningful (or the model's block wasn't
  // real SVG to begin with) -- fall back to the raw text rather than
  // rendering an empty box with no explanation of what was supposed to be
  // there.
  if (!clean || !clean.includes('<svg')) {
    return <pre className="chat-graphic-fallback">{code}</pre>
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
          <button
            type="button"
            className="chat-graphic-overlay-close"
            aria-label="Close"
            onClick={() => setExpanded(false)}
          >
            &times;
          </button>
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
