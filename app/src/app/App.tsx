import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BlockedScreen } from '@/app/BlockedScreen'
import { LoginForm } from '@/app/LoginForm'
import { SessionRouter } from '@/app/SessionRouter'
import { PublicArtifactView } from '@/features/artifacts/PublicArtifactView'
import { supabase } from '@/lib/supabaseClient'
import { useAppStatus } from '@/app/useAppStatus'

// Checked before anything else in App -- a shared public link
// (docs/decisions/0027) has to work for a signed-out visitor regardless
// of session state or even the app's own maintenance/version block,
// since it's a self-contained read with nothing to do with being signed
// in to Growdy at all.
const PUBLIC_ARTIFACT_PATH = /^\/a\/([^/]+)$/

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const block = useAppStatus()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const publicArtifactMatch = PUBLIC_ARTIFACT_PATH.exec(window.location.pathname)
  if (publicArtifactMatch) return <PublicArtifactView id={publicArtifactMatch[1]} />

  if (block) return <BlockedScreen block={block} />
  if (loading) return null

  return session ? <SessionRouter session={session} /> : <LoginForm />
}

export default App
