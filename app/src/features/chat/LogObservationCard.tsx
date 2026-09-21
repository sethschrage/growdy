import { useState } from 'react'
import { createObservationCandidate } from '@/data/observations'
import type { PhotoLocation } from '@/lib/photo'

// A fenced ```log-observation block in the model's own reply becomes a
// real "Log this" button on that message -- the same pattern
// ConfirmWriteCard (0022) established, and deliberately the same shape
// rather than a new mechanism.
//
// Why this exists: logging an observation used to mean leaving the
// conversation for a separate form, or going through the write tool's
// propose/confirm round trip. But the conversation is where the
// observation actually gets worked out -- a producer describes what they
// saw, the chat asks which block, which vines, what date. So the button
// appears on the message where that lands, and logs what was agreed,
// with no second journey.
//
// It used to write straight to observations, which was honest while
// there was no review step. `0030` put one back for every source, so
// this now files a candidate through create_observation_candidate and
// the producer approves it in the queue. The button is still the moment
// the observation is agreed -- it just proposes rather than commits, and
// says so, because a button that claims "logged" when the row is
// awaiting review is the same lie 0022's dry-run trap taught us to
// avoid.
//
// A photo-backed draft carries photo_path: the storage object the model
// was shown. Nothing but the path travels -- the image itself never
// enters the transcript (see the chat function), so a conversation
// re-sent on a later turn can't drag an expired URL or a megabyte of
// base64 along with it.
type ObservationDraft = {
  note: string
  observed_date?: string | null
  planting_id?: string | null
  photo_path?: string | null
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

// No session prop any more: create_observation_candidate resolves the
// producer from auth.uid() server-side, so the component has nothing to
// look up and nothing to be handed.
export function LogObservationCard({
  code,
  conversationId,
  photoMetaFor,
  lastPhotoPath,
}: {
  code: string
  conversationId: string | null
  photoMetaFor?: (path: string) => { location: PhotoLocation | null; takenOn: string | null } | null
  lastPhotoPath?: string | null
}) {
  const [status, setStatus] = useState<'pending' | 'logging' | 'logged' | 'error'>('pending')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const draft = parseDraft(code)

  // Malformed JSON, or a stray fence from an older conversation -- show
  // the text rather than a button that can't do anything, same fallback
  // ConfirmWriteCard uses.
  if (!draft) {
    return <pre className="chat-block-fallback">{code}</pre>
  }

  // Captured as plain values so handleLog doesn't close over `draft`
  // itself -- TypeScript can't carry the !draft check above across a
  // closure boundary, so inside the handler it still sees draft as
  // possibly null. Same reason ConfirmWriteCard captures its own
  // proposal_id as a string.
  const note = draft.note.trim()
  const observedDate = draft.observed_date ?? null
  const plantingId = draft.planting_id ?? null
  // The model's own path wins. Falling back to the conversation's most
  // recent photo covers the case it cannot handle itself: the path is in
  // its context for exactly one turn, so a block written any later has no
  // path to include. Without this, the observations you had to argue for
  // are the ones that lose their evidence.
  const photoPath = draft.photo_path ?? lastPhotoPath ?? null

  // No profile lookup any more: create_observation_candidate reads the
  // producer from the caller's own profile, so a client can't file
  // against somebody else's producer even by accident. The summary is
  // the queue's one-line label and the note is what the observation
  // becomes -- the same string here, since the model wrote one clear
  // sentence, but they are separate columns because a photo analysis
  // will want a longer note than a queue row should show.
  async function handleLog() {
    setStatus('logging')
    setErrorMessage(null)

    // Where the camera was, kept apart from what the photo is about.
    // planting_id answers the second; most photos never have one, and
    // for those this is the only spatial fact there will ever be.
    const meta = photoPath && photoMetaFor ? photoMetaFor(photoPath) : null
    const location = meta?.location ?? null

    try {
      await createObservationCandidate({
        summary: note,
        note,
        // The capture date, for the same reason as the path: the model is
        // told it once, on the turn the photo arrives, and a block written
        // later has no way to know it. Its own answer wins when it gave one.
        observedDate: observedDate ?? meta?.takenOn ?? null,
        plantingId,
        photoPath,
        conversationId,
        source: photoPath ? 'photo' : 'chat_tool',
        photoLatitude: location?.latitude ?? null,
        photoLongitude: location?.longitude ?? null,
        photoAccuracyM: location?.accuracyM ?? null,
      })
      setStatus('logged')
    } catch (e) {
      setStatus('error')
      setErrorMessage(e instanceof Error ? e.message : 'Could not file this observation.')
    }
  }

  return (
    <div className="log-observation-card">
      <div className="log-observation-header">
        <span className="log-observation-label">Observation</span>
        {observedDate && <span className="log-observation-date">{observedDate}</span>}
      </div>
      <p className="log-observation-note">{note}</p>
      {status === 'logged' ? (
        <p className="log-observation-done">
          Sent for review. Approve it in Review observations and it joins your observation log.
        </p>
      ) : (
        <div className="log-observation-actions">
          <button
            type="button"
            className="log-observation-log"
            onClick={handleLog}
            disabled={status === 'logging'}
          >
            {status === 'logging' ? 'Sending...' : 'Send for review'}
          </button>
        </div>
      )}
      {status === 'error' && errorMessage && <p className="log-observation-error">{errorMessage}</p>}
    </div>
  )
}
