import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useObservationQueue } from '@/features/observations/useObservationQueue'
import { fetchProducerId } from '@/data/profile'
import { searchPlantings, type PlantingSearchResult as PlantingOption } from '@/data/vineyard'

function plantingOptionLabel(option: PlantingOption): string {
  const position = option.label ?? option.parcel
  const variety = option.nickname ?? option.scion ?? option.variety
  return variety ? `${position} -- ${variety}` : position
}

// Local, not UTC -- new Date().toISOString() can land on the wrong day
// for anyone west of UTC in the evening, which matters here since this
// becomes observed_date, a real field-visit date.
function todayLocalDate(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

// Search-as-you-type rather than a <select> -- this producer alone has
// ~3,000 active plantings, too many to load into one dropdown. Matches
// against label/nickname/variety/scion, the same things a producer would
// actually recognize a vine by (see planting_readable's own column
// comments, docs/decisions/0018).
function PlantingPicker({
  value,
  onChange,
}: {
  value: PlantingOption | null
  onChange: (option: PlantingOption | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlantingOption[] | null>(null)
  const requestId = useRef(0)

  // Clearing on an empty box happens in the change handler below, not
  // here: emptying the field is the event that means "forget those
  // results", and doing it from the effect is a second render for
  // something the first one already knew.
  useEffect(() => {
    if (!query.trim()) return
    const thisRequest = ++requestId.current
    const timeout = setTimeout(async () => {
      // The request id guards against an out-of-order reply: typing
      // fast fires several of these, and the slowest is not the one
      // whose results belong on screen.
      const found = await searchPlantings(query).catch(() => [])
      if (requestId.current === thisRequest) setResults(found)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  if (value) {
    return (
      <div className="observation-planting-selected">
        <span>{plantingOptionLabel(value)}</span>
        <button type="button" className="observation-planting-change" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="observation-planting-picker">
      {/* A search box over row numbers, positions and variety names --
          none of which survive autocorrect. "Gamay" and a row label like
          "3B" are exactly the things iOS likes to rewrite, and a
          rewritten query matches nothing. */}
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          // An empty box shows nothing, and an in-flight search for what
          // used to be in it must not land afterwards and repopulate the
          // list.
          if (!e.target.value.trim()) {
            requestId.current += 1
            setResults(null)
          }
        }}
        placeholder="Search row, position, or variety"
      />
      {results !== null && (
        <ul className="observation-planting-results">
          {results.length === 0 && <li className="observation-planting-empty">No matches.</li>}
          {results.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(option)
                  setQuery('')
                  setResults(null)
                }}
              >
                {plantingOptionLabel(option)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Structured entry into observations, deliberately outside the chat/model
// path -- see docs/decisions/0009's chat-based submission flow (removed by
// 0012) and docs/decisions/0005. A producer typing directly into this form
// isn't AI-parsed, and nothing here is held back for review: an
// observation counts as data the moment it's logged, and the producer
// deletes it from the observation log if they didn't want it (0009's
// amendment, migration 20260918020000).
//
// v1 sticks to the columns observations already has (planting, date,
// note) rendered as real widgets -- no new schema. conversation_id stays
// null, same as any other observation entered directly rather than
// resolved from a chat session.
export function ObservationForm({ session, onClose }: { session: Session; onClose: () => void }) {
  const [producerId, setProducerId] = useState<string | null>(null)
  const [planting, setPlanting] = useState<PlantingOption | null>(null)
  const [observedDate, setObservedDate] = useState(todayLocalDate())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [waitingForSignal, setWaitingForSignal] = useState(false)
  const { capture } = useObservationQueue(producerId)

  useEffect(() => {
    fetchProducerId(session.user.id)
      .then(setProducerId)
      .catch(() => setProducerId(null))
  }, [session.user.id])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!producerId || !note.trim()) return
    setSubmitting(true)
    setError(null)
    // Files a candidate rather than an observation (0030). A note the
    // producer typed themselves is the case where review protects least
    // -- they are the ground truth for their own vineyard -- but it goes
    // through the same door as everything else, so there is one way in
    // rather than one way plus an exception.
    let delivered = false
    try {
      // Written down first, sent second. The promise being made is that
      // the observation is recorded -- with no signal it is recorded
      // here, and goes when the phone can.
      ;({ delivered } = await capture({
        summary: note.trim(),
        note: note.trim(),
        observedDate: observedDate || null,
        plantingId: planting?.id ?? null,
        source: 'producer',
      }))
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : 'Could not save this observation.')
      return
    }
    setWaitingForSignal(!delivered)
    setSubmitting(false)
    setNote('')
    setPlanting(null)
    setSavedCount((c) => c + 1)
  }

  return (
    <div className="observation-form-overlay">
      <div className="observation-form-header">
        <h2>New observation</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="observation-form-close">
          &times;
        </button>
      </div>
      <div className="observation-form-body">
        <form onSubmit={handleSubmit}>
          {/* A plain div, not <label> -- a <label> wrapping a compound
              widget with more than one button forwards a synthetic click
              to whichever labelable element ends up first in the DOM once
              React re-renders, which (after selecting a planting swaps the
              search results for a "Change" button in the same spot)
              immediately fires a second click on that button and undoes
              the selection. */}
          <div className="observation-field">
            Planting (optional)
            <PlantingPicker value={planting} onChange={setPlanting} />
          </div>
          <label>
            Date
            <input type="date" value={observedDate} onChange={(e) => setObservedDate(e.target.value)} />
          </label>
          <label>
            Note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you see?"
              rows={4}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          {savedCount > 0 && !error && !waitingForSignal && (
            <p className="observation-form-status">
              Sent for review{savedCount > 1 ? ` (${savedCount})` : ''} -- approve it in Review
              observations and it joins your log.
            </p>
          )}
          {/* Saved either way -- the difference is only whether it has
              left the phone yet, and saying so beats a success message
              that quietly means something else. */}
          {savedCount > 0 && !error && waitingForSignal && (
            <p className="observation-form-status">
              Saved on this phone{savedCount > 1 ? ` (${savedCount})` : ''}. It will send itself
              for review as soon as you have signal.
            </p>
          )}
          <button type="submit" disabled={submitting || !producerId}>
            {submitting ? 'Sending...' : 'Send for review'}
          </button>
        </form>
      </div>
    </div>
  )
}
