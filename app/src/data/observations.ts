import { supabase } from '@/lib/supabaseClient'
import { rpcArgs, unwrap, unwrapList } from '@/data/result'

// Observations and the queue in front of them (0030): every observation
// in the database got there by being confirmed out of
// observation_candidates, so the two belong in one module rather than
// one per table -- confirming is the edge between them, and it is a
// single function on the database side for the same reason.

export type Observation = {
  id: string
  observed_date: string | null
  note: string
  created_at: string
  planting_id: string | null
  conversation_id: string | null
  // The storage path of the photo this observation was made from, when
  // there was one. Named photo_metadata because 0009 reserved the column
  // long before anything wrote to it.
  photo_metadata: string | null
}

export type ObservationCandidateSource = 'chat_scan' | 'photo' | 'producer' | 'chat_tool'

export type ObservationCandidate = {
  id: string
  conversation_id: string | null
  summary: string
  note: string | null
  observed_date: string | null
  planting_id: string | null
  photo_path: string | null
  source: ObservationCandidateSource
  status: 'pending' | 'confirmed' | 'dismissed'
  created_at: string
}

export type NewObservationCandidate = {
  summary: string
  note?: string | null
  observedDate?: string | null
  plantingId?: string | null
  photoPath?: string | null
  conversationId?: string | null
  source: ObservationCandidateSource
  photoLatitude?: number | null
  photoLongitude?: number | null
  photoAccuracyM?: number | null
}

const OBSERVATION_COLUMNS =
  'id, observed_date, note, created_at, planting_id, conversation_id, photo_metadata'

const CANDIDATE_COLUMNS =
  'id, conversation_id, summary, note, observed_date, planting_id, photo_path, source, status, created_at'

export async function listObservations(): Promise<Observation[]> {
  // No producer filter: RLS scopes every one of these reads to the
  // caller's own producer, and a filter here would read as though it
  // were the thing keeping one vineyard's records out of another's.
  return unwrapList(
    await supabase.from('observations').select(OBSERVATION_COLUMNS).order('created_at', { ascending: false }),
  )
}

// One planting's own history, for the detail sheet. Ordered by the day
// it was seen rather than the day it was typed up -- a note entered
// later about an earlier morning belongs in its own place in the story,
// and nullsFirst: false keeps the undated ones at the bottom instead of
// on top of everything.
export async function listObservationsForPlanting(plantingId: string): Promise<Observation[]> {
  return unwrapList(
    await supabase
      .from('observations')
      .select(OBSERVATION_COLUMNS)
      .eq('planting_id', plantingId)
      .order('observed_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  )
}

export async function deleteObservation(id: string): Promise<void> {
  unwrap(await supabase.from('observations').delete().eq('id', id))
}

export async function listPendingCandidates(): Promise<ObservationCandidate[]> {
  const rows = unwrapList(
    await supabase
      .from('observation_candidates')
      .select(CANDIDATE_COLUMNS)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  )
  return rows as ObservationCandidate[]
}

// The only way anything enters observations (0030). Returns the new
// candidate's id -- nullable only because supabase-js types every RPC
// result that way, not because the function has a path that returns
// nothing.
export async function createObservationCandidate(
  candidate: NewObservationCandidate,
): Promise<string | null> {
  return unwrap(
    await supabase.rpc(
      'create_observation_candidate',
      rpcArgs({
        p_summary: candidate.summary,
        p_note: candidate.note ?? null,
        p_observed_date: candidate.observedDate ?? null,
        p_planting_id: candidate.plantingId ?? null,
        p_photo_path: candidate.photoPath ?? null,
        p_conversation_id: candidate.conversationId ?? null,
        p_source: candidate.source,
        p_photo_latitude: candidate.photoLatitude ?? null,
        p_photo_longitude: candidate.photoLongitude ?? null,
        p_photo_accuracy_m: candidate.photoAccuracyM ?? null,
      }),
    ),
  )
}

// One RPC, one transaction (0030): this used to be two client statements
// with nothing holding them together, so a failure in between left an
// observation whose candidate still read pending and confirming again
// produced a duplicate. Idempotent on anything not pending, so a
// double-tap on a slow connection is a no-op rather than an error a
// producer has to interpret.
export async function confirmObservationCandidate(candidateId: string): Promise<void> {
  unwrap(await supabase.rpc('confirm_observation_candidate', { p_candidate_id: candidateId }))
}

export async function dismissObservationCandidate(candidateId: string): Promise<void> {
  unwrap(
    await supabase
      .from('observation_candidates')
      .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
      .eq('id', candidateId),
  )
}
