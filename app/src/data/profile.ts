import { supabase } from '@/lib/supabaseClient'
import { unwrap } from '@/data/result'

// The producer lookup was written out seven times across the client
// before this file: Chat, useConversationLog, ObservationForm,
// SessionRouter and the rest each did their own
// `from('profiles').select('producer_id').eq('id', user).single()`, and
// each decided for itself what a missing row meant -- `.single()` in
// some, `.maybeSingle()` in others, which is the difference between an
// error and a null for the same situation.
//
// It matters more than the duplication suggests: producer_id is the
// tenancy key. Every insert the client makes is scoped by it, and RLS
// checks it on the way in. One definition of "which producer is this
// person" is worth having before a map feature starts asking the same
// question from a sixth place.

export async function fetchProducerId(userId: string): Promise<string | null> {
  // maybeSingle, not single: an account with no profile row is a real
  // state this app has (see 0026 and NoProducerScreen), not a fault.
  const row = unwrap(
    await supabase.from('profiles').select('producer_id').eq('id', userId).maybeSingle(),
  )
  return row?.producer_id ?? null
}

export async function hasProfile(userId: string): Promise<boolean> {
  const row = unwrap(await supabase.from('profiles').select('id').eq('id', userId).maybeSingle())
  return row !== null
}

// Which release the producer has already been shown, so "What's new"
// doesn't reappear for one they've dismissed. Null means they have
// never dismissed one.
export async function fetchLastSeenRelease(userId: string): Promise<string | null> {
  const row = unwrap(
    await supabase.from('profiles').select('last_seen_release').eq('id', userId).maybeSingle(),
  )
  return row?.last_seen_release ?? null
}

export async function markReleaseSeen(userId: string, tag: string): Promise<void> {
  unwrap(await supabase.from('profiles').update({ last_seen_release: tag }).eq('id', userId))
}
