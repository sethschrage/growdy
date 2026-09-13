import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { ObservationChat } from './ObservationChat'
import { DataQuestionChat } from './DataQuestionChat'
import { PixelBurger, PixelCloud, PixelExit, PixelPencil, PixelPlus, PixelQuestion, PixelSprout } from './icons'

function LoginForm() {
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (error) setError(error.message)
  }

  return (
    <div className="login-screen">
      <PixelCloud width={90} top="8%" left="8%" duration="9s" />
      <PixelCloud width={70} top="16%" left="62%" duration="7s" />
      <PixelCloud width={110} top="78%" left="18%" duration="10s" />
      <PixelCloud width={80} top="85%" left="65%" duration="8s" />
      <div className="star" style={{ top: '6%', left: '30%', animationDelay: '0s' }} />
      <div className="star" style={{ top: '10%', left: '75%', animationDelay: '0.5s' }} />
      <div className="star" style={{ top: '4%', left: '55%', animationDelay: '1s' }} />
      <div className="star" style={{ top: '14%', left: '15%', animationDelay: '1.5s' }} />
      <div className="login-content">
        <span className="app-icon" role="img" aria-label="growdy">
          <PixelSprout size={56} />
        </span>
        <h1>growdy</h1>
        {error && <p className="error">{error}</p>}
        <button type="button" className="google-signin-button" onClick={handleGoogleSignIn}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3436 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z"
          />
          <path
            fill="#EA4335"
            d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6564 3.5795 9 3.5795z"
          />
        </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  )
}

function AccountMenu({
  email,
  mode,
  onNewChat,
  onToggleMode,
  onSignOut,
}: {
  email: string
  mode: 'submit' | 'ask'
  onNewChat: () => void
  onToggleMode: () => void
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
        className={`app-menu-toggle${open ? ' app-menu-toggle--open' : ''}`}
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        <PixelBurger size={30} />
      </button>
      {open && (
        <div className="app-menu-content" role="menu" aria-label={`Account menu for ${email}`}>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="New chat"
            onClick={() => {
              onNewChat()
              setOpen(false)
            }}
          >
            <PixelPencil size={18} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label={mode === 'submit' ? 'Ask a question' : 'Log an observation'}
            onClick={() => {
              onToggleMode()
              setOpen(false)
            }}
          >
            {mode === 'submit' ? <PixelQuestion size={13} /> : <PixelPlus size={18} />}
          </button>
          <button
            type="button"
            className="menu-icon-button menu-icon-button--muted"
            aria-label="Sign out"
            onClick={() => {
              onSignOut()
              setOpen(false)
            }}
          >
            <PixelExit size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

function SignedIn({ session }: { session: Session }) {
  const [chatKey, setChatKey] = useState(0)
  const [mode, setMode] = useState<'submit' | 'ask'>('submit')

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-icon" role="img" aria-label="growdy">
            <PixelSprout size={44} />
          </span>
        </div>
        <AccountMenu
          email={session.user.email ?? ''}
          mode={mode}
          onNewChat={() => setChatKey((k) => k + 1)}
          onToggleMode={() => {
            setMode((m) => (m === 'submit' ? 'ask' : 'submit'))
            setChatKey((k) => k + 1)
          }}
          onSignOut={() => supabase.auth.signOut()}
        />
      </header>
      {mode === 'submit' ? (
        <ObservationChat key={chatKey} session={session} />
      ) : (
        <DataQuestionChat key={chatKey} session={session} />
      )}
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
