import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  confirmObservationCandidate,
  dismissObservationCandidate,
  listPendingCandidates,
  type ObservationCandidate,
} from '@/data/observations'

export type { ObservationCandidate }

// Fetch-on-mount, refreshed imperatively after confirm/dismiss -- same
// shape as useDataSources. Only pending candidates: once reviewed, a
// candidate isn't something to keep showing here.
export function useObservationCandidates(session: Session) {
  const [candidates, setCandidates] = useState<ObservationCandidate[] | null>(null)

  async function refresh() {
    const pending = await listPendingCandidates().catch(() => [])
    setCandidates(pending)
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
    try {
      await confirmObservationCandidate(candidate.id)
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not confirm this observation.'
    }
    await refresh()
    return null
  }

  async function dismiss(candidate: ObservationCandidate) {
    await dismissObservationCandidate(candidate.id)
    await refresh()
  }

  return { candidates, confirm, dismiss }
}
