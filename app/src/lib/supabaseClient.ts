import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/data/schema'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY -- copy .env.example to .env and fill them in.',
  )
}

// Typed against the generated schema, so a column that doesn't exist,
// an RPC argument that was renamed, or a row read as the wrong shape is
// a compile error rather than a runtime `undefined` somewhere in a
// component. See src/data/ for the modules that are meant to hold the
// queries themselves.
export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
