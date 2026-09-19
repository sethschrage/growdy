import { useEffect, useState } from 'react'
import { deleteObservation, listObservations, type Observation } from '@/data/observations'
import { ObservationPhoto } from '@/features/observations/ObservationPhoto'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// The producer's whole observation log, newest first, with a delete on
// every row. This is what replaced 0009's review gate: observations count
// as data the moment they're logged, and correcting the record means
// removing an entry rather than approving one (see the amendment on 0009
// and migration 20260918020000).
//
// Deleting is safe to offer this plainly because 0022's audit trigger
// writes the entire old row into audit_log on delete -- the row leaves
// the producer's data but not the project's history, and can be restored
// from the audit log. That's what makes this a better correction
// mechanism than a queue: the reversible action is the one a producer can
// actually reach, and the irreversible one (never counting a real field
// note at all, because nobody approved it) is the one that's gone.
//
// Reuses ProducerDataView's dense .pdv-* visual language rather than the
// pixel-art chat chrome, same as ArtifactsView.
export function ObservationLogView({ onClose }: { onClose: () => void }) {
  const [observations, setObservations] = useState<Observation[] | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    listObservations()
      .then(setObservations)
      .catch(() => setObservations([]))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    try {
      await deleteObservation(id)
    } catch (e) {
      // Worth surfacing rather than silently leaving the row in place --
      // a delete that looks like it worked and didn't is the same class
      // of bug as a write reported before it was confirmed.
      setDeletingId(null)
      setError(e instanceof Error ? e.message : 'Could not delete this observation.')
      return
    }
    setDeletingId(null)
    setConfirmingId(null)
    refresh()
  }

  return (
    <div className="pdv-overlay">
      <div className="pdv-header">
        <h2>Observation Log</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="pdv-close">
          &times;
        </button>
      </div>
      <div className="pdv-body">
        {error && <p className="pdv-error">{error}</p>}
        {observations === null && <p className="pdv-empty">Loading...</p>}
        {observations !== null && observations.length === 0 && (
          <p className="pdv-empty">Nothing logged yet -- tell the chat what you saw, or use the observation form.</p>
        )}
        {observations !== null && observations.length > 0 && (
          <ul className="obs-log-list">
            {observations.map((o) => (
              <li key={o.id} className="obs-log-item">
                <div className="obs-log-item-main">
                  <div className="obs-log-meta">
                    <span className="obs-log-date">{o.observed_date ?? formatDate(o.created_at)}</span>
                    {o.conversation_id && <span className="obs-log-source">from chat</span>}
                    {o.photo_metadata && <span className="obs-log-source">photo</span>}
                    {!o.planting_id && <span className="obs-log-source">whole vineyard</span>}
                  </div>
                  {/* The photo is what the note was written from, so the
                      log shows both -- a description of a vine reads very
                      differently next to the picture of it, and deleting
                      is the correction mechanism here (0028), which needs
                      the evidence to decide against. */}
                  {o.photo_metadata && (
                    <ObservationPhoto path={o.photo_metadata} alt="The photo this observation came from" />
                  )}
                  <p className="obs-log-note">{o.note}</p>
                </div>
                {confirmingId === o.id ? (
                  <div className="obs-log-delete-confirm">
                    <span>Delete this note?</span>
                    <div className="obs-log-delete-confirm-actions">
                      <button
                        type="button"
                        className="obs-log-delete-confirm-yes"
                        onClick={() => handleDelete(o.id)}
                        disabled={deletingId === o.id}
                      >
                        {deletingId === o.id ? 'Deleting...' : 'Delete'}
                      </button>
                      <button type="button" onClick={() => setConfirmingId(null)} disabled={deletingId === o.id}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="obs-log-delete-toggle"
                    aria-label="Delete this observation"
                    onClick={() => setConfirmingId(o.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
