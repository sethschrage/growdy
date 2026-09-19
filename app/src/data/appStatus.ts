import { supabase } from '@/lib/supabaseClient'
import { unwrap } from '@/data/result'

export type MaintenanceStatus = { maintenance: boolean; message: string | null }

// Polled every 30 seconds by useAppStatus, which is the reason this one
// swallows its own errors instead of throwing: the check runs forever in
// the background, and a network blip while someone is mid-sentence in
// the chat must not surface as a failure or -- worse -- as a
// maintenance block. Not knowing means "carry on".
export async function fetchMaintenanceStatus(): Promise<MaintenanceStatus | null> {
  try {
    return unwrap(await supabase.from('app_status').select('maintenance, message').single())
  } catch {
    return null
  }
}
