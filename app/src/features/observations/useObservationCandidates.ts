import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export type ObservationCandidate = {
  id: string
  conversation_id: string | null
  summary: string
  note: string | null
  observed_date: string | null
  planting_id: string | null
  photo_path: string | null
  source: 'chat_scan' | 'photo' | 'producer' | 'chat_tool'
  status: 'pending' | 'confirmed' | 'dismissed'
  created_at: string
}

// Fetch-on-mount, refreshed imperatively after confirm/dismiss -- same
// shape as useDataSources. Only pending candidates: once reviewed, a
// candidate isn't something to keep showing here.
export function useObservationCandidates(session: Session) {
  const [candidates, setCandidates] = useState<ObservationCandidate[] | null>(null)

  async function refresh() {
    const { data } = await supabase
      .from('observation_candidates')
      .select('id, conversation_id, summary, note, observed_date, planting_id, photo_path, source, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setCandidates((data as ObservationCandidate[]) ?? [])
  }

  useEffect(() => {
    refresh()
  }, [session.user.id])

  // One RPC, one transaction (0030). This used to insert the observation
  // and then mark the candidate as two separate client statements with
  // nothing holding them together -- a failure in between left an
  // observation whose candidate still read pending, so confirming again
  // produced a duplicate. The function is idempotent on anything not
  // pending, so a double-tap on a slow connection is a no-op rather than
  // an error the producer has to interpret.
  async function confirm(candidate: ObservationCandidate) {
    const { error } = await supabase.rpc('confirm_observation_candidate', {
      p_candidate_id: candidate.id,
    })
    if (error) return error.message
    await refresh()
    return null
  }

  async function dismiss(candidate: ObservationCandidate) {
    await supabase
      .from('observation_candidates')
      .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
      .eq('id', candidate.id)
    await refresh()
  }

  return { candidates, confirm, dismiss }
}
