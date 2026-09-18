import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useObservationCandidates, type ObservationCandidate } from './useObservationCandidates'
import { ObservationPhoto } from './ObservationPhoto'

// Where a candidate came from decides how much scrutiny it deserves, so
// the queue says it plainly instead of showing every row identically.
function describeOrigin(candidate: ObservationCandidate) {
  const when = new Date(candidate.created_at).toLocaleDateString()
  if (candidate.source === 'photo') return `From a photo you sent, ${when}.`
  if (candidate.source === 'chat_scan') return `Found ${when} in a past conversation.`
  if (candidate.source === 'chat_tool') return `Offered in chat, ${when}.`
  return `Added ${when}.`
}

function CandidateRow({
  candidate,
  onConfirm,
  onDismiss,
}: {
  candidate: ObservationCandidate
  onConfirm: (c: ObservationCandidate) => void
  onDismiss: (c: ObservationCandidate) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <li className="data-source-item">
      <div className="data-source-item-header">
        <span className="data-source-name">{candidate.summary}</span>
      </div>
      {/* The photo is the evidence the note was written from, so it has
          to be visible here -- approving a description of a vine you
          cannot see is worse than having no queue at all. */}
      {candidate.photo_path && (
        <ObservationPhoto path={candidate.photo_path} alt="The photo this observation came from" />
      )}
      <div className="data-source-status">
        {/* summary is the one-line label; note is the whole observation
            as it will be written. They're the same string for a typed
            note and very different for a photo analysis, so the fuller
            one is shown when it differs rather than approving a
            one-liner and storing paragraphs. */}
        {candidate.note && candidate.note !== candidate.summary && (
          <p className="candidate-note">{candidate.note}</p>
        )}
        <p>{describeOrigin(candidate)}</p>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="data-source-actions">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm(candidate)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          Confirm
        </button>
        <button type="button" disabled={busy} onClick={() => onDismiss(candidate)} className="data-source-remove">
          Dismiss
        </button>
      </div>
    </li>
  )
}

// Reuses DataSourcesView's own overlay/list styling -- this is the same
// shape of screen (a full-screen list with per-row actions), not a new
// visual language worth inventing.
//
// Since 0030 this is the only way into observations, not a side channel
// for one scanner's suggestions: a typed note, a photo analysis and the
// 6-hourly scan all land here. Confirming runs
// confirm_observation_candidate, which writes the observation and marks
// the candidate in one transaction.
export function ObservationCandidatesView({
  session,
  onClose,
  onOpenLog,
}: {
  session: Session
  onClose: () => void
  onOpenLog: () => void
}) {
  const { candidates, confirm, dismiss } = useObservationCandidates(session)

  return (
    <div className="data-sources-overlay">
      <div className="data-sources-header">
        <h2>Possible Observations</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="data-sources-close">
          &times;
        </button>
      </div>
      {/* Approving sends a row somewhere, and the somewhere should be one
          tap away -- otherwise the only way to see what you just
          approved is to close this, find the menu, and open the log. */}
      <div className="candidates-log-link">
        <button type="button" onClick={onOpenLog}>
          View observation log
        </button>
      </div>
      <div className="data-sources-body">
        {candidates === null && <p className="history-empty">Loading...</p>}
        {candidates !== null && candidates.length === 0 && (
          <p className="history-empty">Nothing found yet -- past conversations are scanned every few hours.</p>
        )}
        <ul className="data-source-list">
          {candidates?.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              onConfirm={async (candidate) => {
                const errorMessage = await confirm(candidate)
                if (errorMessage) throw new Error(errorMessage)
              }}
              onDismiss={dismiss}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
