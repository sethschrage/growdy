import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Growdy</h1>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
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
