import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BlockedScreen } from '@/app/BlockedScreen'
import { LoginForm } from '@/app/LoginForm'
import { SessionRouter } from '@/app/SessionRouter'
import { supabase } from '@/lib/supabaseClient'
import { useAppStatus } from '@/app/useAppStatus'

// Every path lands here: the app is one screen deep from the producer's
// point of view, and what they see is decided by whether the app is
// blocked and whether they are signed in, never by the URL.
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

  if (block) return <BlockedScreen block={block} />
  if (loading) return null

  return session ? <SessionRouter session={session} /> : <LoginForm />
}

export default App
