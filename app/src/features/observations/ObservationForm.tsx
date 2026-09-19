import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

type PlantingOption = {
  id: string
  label: string | null
  nickname: string | null
  variety: string | null
  scion: string | null
  parcel: string
}

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

  useEffect(() => {
    // Strip characters meaningful to PostgREST's filter grammar (the
    // .or() string below) rather than escaping them -- none of them can
    // ever appear in a real label/variety search anyway.
    const trimmed = query.trim().replace(/[,()%*]/g, '')
    if (!trimmed) {
      setResults(null)
      return
    }
    const thisRequest = ++requestId.current
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('planting_readable')
        .select('id, label, nickname, variety, scion, parcel')
        .is('removed_date', null)
        .or(
          `label.ilike.%${trimmed}%,nickname.ilike.%${trimmed}%,variety.ilike.%${trimmed}%,scion.ilike.%${trimmed}%`,
        )
        .order('label')
        .limit(20)
      if (requestId.current === thisRequest) {
        setResults((data as PlantingOption[]) ?? [])
      }
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
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
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

  useEffect(() => {
    supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProducerId(data?.producer_id ?? null))
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
    const { error } = await supabase.rpc('create_observation_candidate', {
      p_summary: note.trim(),
      p_note: note.trim(),
      p_observed_date: observedDate || null,
      p_planting_id: planting?.id ?? null,
      p_photo_path: null,
      p_conversation_id: null,
      p_source: 'producer',
      // Explicit nulls rather than relying on defaults: PostgREST picks a
      // function by the argument names it is handed, and leaving some out
      // makes resolution depend on an overload set staying tidy.
      p_photo_latitude: null,
      p_photo_longitude: null,
      p_photo_accuracy_m: null,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
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
          {savedCount > 0 && !error && (
            <p className="observation-form-status">
              Sent for review{savedCount > 1 ? ` (${savedCount})` : ''} -- approve it in Review
              observations and it joins your log.
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
