import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { ObservationChat } from './ObservationChat'

function LoginForm() {
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (error) setError(error.message)
  }

  return (
    <div>
      <h1>Growdy</h1>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={handleGoogleSignIn}>
        Sign in with Google
      </button>
    </div>
  )
}

function SignedIn({ session }: { session: Session }) {
  return (
    <div>
      <h1>Growdy</h1>
      <p>Signed in as {session.user.email}</p>
      <button type="button" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
      <ObservationChat session={session} />
    </div>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) return null

  return session ? <SignedIn session={session} /> : <LoginForm />
}

export default App
