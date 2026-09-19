import { useState } from 'react'
import { confirmWrite, declineWrite } from '@/data/writes'

// The real "click, not the model's own judgment" affordance 0022 requires
// -- confirm_write is called from here, straight from the producer's own
// browser session, never proxied through the chat function or triggered
// by anything the model does on its own. Mirrors SvgGraphic's pattern: a
// fenced code block in the model's own markdown becomes a real component,
// not a new chat-function capability.
type WriteProposal = {
  proposal_id: string
  summary: unknown
}

function parseProposal(code: string): WriteProposal | null {
  try {
    const parsed = JSON.parse(code)
    if (parsed && typeof parsed.proposal_id === 'string') return parsed as WriteProposal
    return null
  } catch {
    return null
  }
}

// summary/confirm_write's result are both "whatever RETURNING produced" --
// an array of affected rows, each an arbitrary set of columns. No fixed
// shape to build a table around, so this renders them as plain key: value
// lines, capped so one huge bulk write doesn't take over the chat bubble.
function summaryLines(data: unknown): string {
  const rows = Array.isArray(data) ? data : [data]
  if (rows.length === 0) return 'No rows would be affected.'
  const shown = rows
    .slice(0, 5)
    .map((row) =>
      row && typeof row === 'object'
        ? Object.entries(row as Record<string, unknown>)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('\n')
        : String(row),
    )
    .join('\n\n')
  return rows.length > 5 ? `${shown}\n\n...and ${rows.length - 5} more row(s)` : shown
}

export function ConfirmWriteCard({ code }: { code: string }) {
  const [status, setStatus] = useState<'pending' | 'confirming' | 'applied' | 'declined' | 'error'>('pending')
  const [result, setResult] = useState<unknown>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const proposal = parseProposal(code)

  // Not real confirm-write JSON (the model wrote something malformed, or
  // this is a stray fence from an old conversation before this shipped) --
  // fall back to plain text rather than a broken, buttonless card.
  if (!proposal) {
    return <pre className="chat-graphic-fallback">{code}</pre>
  }

  // Captured as a plain string so handleConfirm/handleDecline don't close
  // over `proposal` itself -- TypeScript can't carry the !proposal check
  // above across a closure boundary, so it still sees `proposal` as
  // possibly null inside them otherwise.
  const proposalId = proposal.proposal_id

  async function handleConfirm() {
    setStatus('confirming')
    try {
      setResult(await confirmWrite(proposalId))
      setStatus('applied')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not apply the change.')
      setStatus('error')
    }
  }

  async function handleDecline() {
    await declineWrite(proposalId)
    setStatus('declined')
  }

  return (
    <div className="write-confirm-card">
      <pre className="write-confirm-summary">{summaryLines(proposal.summary)}</pre>
      {status === 'pending' && (
        <div className="write-confirm-actions">
          <button type="button" onClick={handleConfirm}>
            Confirm
          </button>
          <button type="button" className="write-confirm-decline" onClick={handleDecline}>
            Decline
          </button>
        </div>
      )}
      {status === 'confirming' && <p className="write-confirm-status">Applying...</p>}
      {status === 'applied' && (
        <>
          <p className="write-confirm-status">Done.</p>
          <pre className="write-confirm-summary">{summaryLines(result)}</pre>
        </>
      )}
      {status === 'declined' && <p className="write-confirm-status">Declined -- nothing changed.</p>}
      {status === 'error' && <p className="write-confirm-status error">{errorMessage}</p>}
    </div>
  )
}
