import { useEffect, useRef, useState } from 'react'
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
    <div className="login-screen">
      <h1>growdy</h1>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={handleGoogleSignIn}>
        Sign in with Google
      </button>
    </div>
  )
}

function AccountMenu({
  email,
  onNewChat,
  onSignOut,
}: {
  email: string
  onNewChat: () => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div className="app-menu" ref={ref}>
      <button
        type="button"
        className="app-menu-toggle"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="app-menu-content">
          <p>{email}</p>
          <button
            type="button"
            onClick={() => {
              onNewChat()
              setOpen(false)
            }}
          >
            New chat
          </button>
          <button
            type="button"
            onClick={() => {
              onSignOut()
              setOpen(false)
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function SignedIn({ session }: { session: Session }) {
  const [chatKey, setChatKey] = useState(0)

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>growdy</h1>
        <AccountMenu
          email={session.user.email ?? ''}
          onNewChat={() => setChatKey((k) => k + 1)}
          onSignOut={() => supabase.auth.signOut()}
        />
      </header>
      <ObservationChat key={chatKey} session={session} />
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
