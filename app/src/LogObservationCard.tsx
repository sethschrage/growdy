import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

// A fenced ```log-observation block in the model's own reply becomes a
// real "Log this" button on that message -- the third instance of the
// pattern SvgGraphic (0021) and ConfirmWriteCard (0022) already
// established, and deliberately the same shape rather than a new
// mechanism.
//
// Why this exists: logging an observation used to mean leaving the
// conversation for a separate form, or going through the write tool's
// propose/confirm round trip. But the conversation is where the
// observation actually gets worked out -- a producer describes what they
// saw, the chat asks which block, which vines, what date. So the button
// appears on the message where that lands, and logs what was agreed,
// with no second journey.
//
// It writes straight to observations rather than through
// propose_write_query. That's only honest now that there is no review
// step: an observation counts as data the moment it's logged, and the
// producer removes it from the observation log if it was wrong (0009's
// amendment). A confirm/decline round trip to produce a row the producer
// can delete in one tap was ceremony without a purpose.
type ObservationDraft = {
  note: string
  observed_date?: string | null
  planting_id?: string | null
}

function parseDraft(code: string): ObservationDraft | null {
  try {
    const parsed = JSON.parse(code)
    if (parsed && typeof parsed.note === 'string' && parsed.note.trim()) return parsed as ObservationDraft
    return null
  } catch {
    return null
  }
}

export function LogObservationCard({
  code,
  session,
  conversationId,
}: {
  code: string
  session: Session
  conversationId: string | null
}) {
  const [status, setStatus] = useState<'pending' | 'logging' | 'logged' | 'error'>('pending')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const draft = parseDraft(code)

  // Malformed JSON, or a stray fence from an older conversation -- show
  // the text rather than a button that can't do anything, same fallback
  // ConfirmWriteCard uses.
  if (!draft) {
    return <pre className="chat-graphic-fallback">{code}</pre>
  }

  // Captured as plain values so handleLog doesn't close over `draft`
  // itself -- TypeScript can't carry the !draft check above across a
  // closure boundary, so inside the handler it still sees draft as
  // possibly null. Same reason ConfirmWriteCard captures its own
  // proposal_id as a string.
  const note = draft.note.trim()
  const observedDate = draft.observed_date ?? null
  const plantingId = draft.planting_id ?? null

  async function handleLog() {
    setStatus('logging')
    setErrorMessage(null)

    const { data: profile } = await supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.producer_id) {
      setStatus('error')
      setErrorMessage('Could not find your producer.')
      return
    }

    const { error } = await supabase.from('observations').insert({
      producer_id: profile.producer_id,
      planting_id: plantingId,
      observed_date: observedDate,
      note,
      conversation_id: conversationId,
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }
    setStatus('logged')
  }

  return (
    <div className="log-observation-card">
      <div className="log-observation-header">
        <span className="log-observation-label">Observation</span>
        {observedDate && <span className="log-observation-date">{observedDate}</span>}
      </div>
      <p className="log-observation-note">{note}</p>
      {status === 'logged' ? (
        <p className="log-observation-done">Logged. It's in your observation log, and you can delete it from there.</p>
      ) : (
        <div className="log-observation-actions">
          <button
            type="button"
            className="log-observation-log"
            onClick={handleLog}
            disabled={status === 'logging'}
          >
            {status === 'logging' ? 'Logging...' : 'Log this observation'}
          </button>
        </div>
      )}
      {status === 'error' && errorMessage && <p className="log-observation-error">{errorMessage}</p>}
    </div>
  )
}
