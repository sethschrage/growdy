import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

export type ObservationCandidate = {
  id: string
  conversation_id: string
  summary: string
  status: 'pending' | 'confirmed' | 'dismissed'
  created_at: string
}

// Fetch-on-mount, refreshed imperatively after confirm/dismiss -- same
// shape as useDataSources. Only pending candidates: once reviewed, a
// candidate isn't something to keep showing here.
export function useObservationCandidates(session: Session) {
  const [candidates, setCandidates] = useState<ObservationCandidate[] | null>(null)
  const [producerId, setProducerId] = useState<string | null>(null)

  async function refresh() {
    const { data } = await supabase
      .from('observation_candidates')
      .select('id, conversation_id, summary, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setCandidates((data as ObservationCandidate[]) ?? [])
  }

  useEffect(() => {
    supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProducerId(data?.producer_id ?? null))
    refresh()
  }, [session.user.id])

  async function confirm(candidate: ObservationCandidate) {
    if (!producerId) return
    const { error } = await supabase.from('observations').insert({
      producer_id: producerId,
      conversation_id: candidate.conversation_id,
      note: candidate.summary,
      status: 'pending',
    })
    if (error) return error.message
    await supabase
      .from('observation_candidates')
      .update({ status: 'confirmed', reviewed_at: new Date().toISOString() })
      .eq('id', candidate.id)
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
