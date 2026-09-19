import type { Json } from '@/data/schema'
import { supabase } from '@/lib/supabaseClient'
import { unwrap } from '@/data/result'

// The propose/confirm path for a write the model suggested (0022).
//
// Both functions are called from the producer's own browser session in
// response to a click, never proxied through the chat Edge Function and
// never triggered by the model on its own -- that separation is the
// whole point of the mechanism, so it lives in a file of its own rather
// than beside the ordinary queries.

export async function confirmWrite(proposalId: string): Promise<Json> {
  return unwrap(await supabase.rpc('confirm_write', { p_proposal_id: proposalId }))
}

export async function declineWrite(proposalId: string): Promise<void> {
  unwrap(await supabase.from('pending_writes').update({ status: 'declined' }).eq('id', proposalId))
}
