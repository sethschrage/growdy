import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchProducerId } from '@/data/profile'
import { useObservationQueue } from '@/features/observations/useObservationQueue'
import { isStuck } from '@/lib/observationQueue'
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
// 0030 put a gate back in front of that, which this file has to say out
// loud rather than leave the paragraph above reading as the whole story:
// nothing reaches this log without being approved in Review observations
// first, so a capture that has just been delivered appears here not at
// all. Deleting is still the correction after approval -- the queue
// decides what enters the record, the log decides what stays.
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
export function ObservationLogView({ session, onClose }: { session: Session; onClose: () => void }) {
  const [producerId, setProducerId] = useState<string | null>(null)
  const { waiting, flush, deliveredOnItsOwn } = useObservationQueue(producerId)
  const [observations, setObservations] = useState<Observation[] | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flushing, setFlushing] = useState(false)
  const [sentForReview, setSentForReview] = useState(0)
  const flushInFlight = useRef(false)

  function refresh() {
    listObservations()
      .then(setObservations)
      .catch(() => setObservations([]))
  }

  useEffect(() => {
    refresh()
  }, [])

  // The queue needs it to upload a photo, since the storage path is the
  // tenancy check and has to start with the producer.
  useEffect(() => {
    fetchProducerId(session.user.id)
      .then(setProducerId)
      .catch(() => setProducerId(null))
  }, [session.user.id])

  // "Try sending now" with nothing behind it was reported from a phone
  // in a block: pressed, and then nothing at all. In airplane mode the
  // fetch underneath does not fail quickly, it hangs -- tens of seconds
  // on iOS -- and the button sat there looking exactly like a button
  // that had not registered the press, so it got pressed again.
  //
  // The ref is the half of the guard that actually holds. `disabled`
  // makes it visible, but it only takes effect once React has committed
  // the re-render, and two taps in quick succession on a phone can both
  // dispatch before that. A second flush over the same queue re-uploads
  // a photo the first one is still uploading -- another copy of a
  // megabyte in the bucket that nothing references, which is the exact
  // cost flushQueue already goes out of its way to avoid.
  async function handleFlush() {
    if (flushInFlight.current) return
    flushInFlight.current = true
    setFlushing(true)
    // This attempt has not sent anything yet, so an older count must not
    // sit on screen claiming otherwise while it runs.
    setSentForReview(0)
    try {
      const result = await flush()
      if (result.sent > 0) setSentForReview(result.sent)
    } finally {
      flushInFlight.current = false
      setFlushing(false)
    }
  }

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
        {/* Captured, not yet delivered. Shown because a queue nobody can
            see is indistinguishable from data lost: the producer wrote
            something down and is entitled to know where it is. */}
        {waiting.length > 0 && (
          <div className="queued-notice">
            <p>
              {waiting.length === 1 ? '1 observation' : `${waiting.length} observations`} captured
              on this phone, waiting for signal.
              {waiting.some(isStuck) && ' One or more could not be sent.'}
            </p>
            <ul className="queued-list">
              {waiting.map((item) => (
                <li key={item.clientId}>
                  <span className="queued-summary">{item.summary}</span>
                  {isStuck(item) && (
                    <span className="queued-stuck"> -- not sent: {item.lastError}</span>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="queued-retry"
              onClick={() => void handleFlush()}
              disabled={flushing}
            >
              {flushing ? 'Sending...' : 'Try sending now'}
            </button>
          </div>
        )}
        {/* Where the notice was, once it has gone. A flush that gets
            through takes the notice with it and puts nothing in the log
            -- what it sent is a candidate waiting on review (0030) --
            so without this the observation vanishes from the screen the
            producer was watching and appears on no other. Same sentence
            the form uses when it files one, because it is the same
            promise: it went, and here is where to go and accept it. */}
        {sentForReview > 0 && (
          <p className="queued-sent">
            Sent for review{sentForReview > 1 ? ` (${sentForReview})` : ''} -- approve it in Review
            observations and it joins your log.
          </p>
        )}
        {/* The same fact, for a delivery nobody asked for. "Signal
            returned" on its own would be the app talking about itself;
            what the producer asked to see is which of their observations
            went, so the sentence leads with that and mentions the signal
            as the reason it happened. Stays on screen for the life of
            the screen rather than flashing past: they were not
            necessarily looking when it happened. */}
        {deliveredOnItsOwn > 0 && sentForReview === 0 && (
          <p className="queued-sent">
            Your signal came back, and{' '}
            {deliveredOnItsOwn === 1 ? 'an observation was' : `${deliveredOnItsOwn} observations were`}{' '}
            sent for review -- approve{deliveredOnItsOwn === 1 ? ' it' : ' them'} in Review
            observations and{deliveredOnItsOwn === 1 ? ' it joins' : ' they join'} your log.
          </p>
        )}
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
