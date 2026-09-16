import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useObservationCandidates, type ObservationCandidate } from './useObservationCandidates'

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
      <div className="data-source-status">
        <p>Found {new Date(candidate.created_at).toLocaleDateString()} in a past conversation.</p>
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
// visual language worth inventing. Confirming just inserts a normal
// pending observations row (the same "status = pending, reviewed later"
// gate every observation has always gone through) -- this isn't a new
// write path, and it isn't the general write tool (0022) either, since
// observations already has its own insert policy for exactly this shape.
export function ObservationCandidatesView({ session, onClose }: { session: Session; onClose: () => void }) {
  const { candidates, confirm, dismiss } = useObservationCandidates(session)

  return (
    <div className="data-sources-overlay">
      <div className="data-sources-header">
        <h2>Possible Observations</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="data-sources-close">
          &times;
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
