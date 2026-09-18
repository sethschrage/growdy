import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { ArtifactsView } from './ArtifactsView'
import { Chat } from './Chat'
import { HistoryDrawer, type Conversation } from './HistoryDrawer'
import { DataSourcesView } from './DataSourcesView'
import { ObservationCandidatesView } from './ObservationCandidatesView'
import { ObservationForm } from './ObservationForm'
import { ObservationLogView } from './ObservationLogView'
import { ProducerDataView } from './ProducerDataView'
import { PublicArtifactView } from './PublicArtifactView'
import { ReleaseNotes } from './ReleaseNotes'
import { useAppStatus, type AppBlock } from './useAppStatus'
import {
  PixelBunSlice,
  PixelBurger,
  PixelCloud,
  PixelCompose,
  PixelExit,
  PixelGrid,
  PixelHistory,
  PixelMagnifier,
  PixelNetwork,
  PixelPicture,
  PixelPlus,
  PixelSprout,
  PixelToppingSlice,
} from './icons'

function BlockedScreen({ block }: { block: NonNullable<AppBlock> }) {
  return (
    <div className="login-screen">
      <div className="login-content">
        <span className="app-icon" role="img" aria-label="growdy">
          <PixelSprout size={56} />
        </span>
        <h1>growdy</h1>
        {block.reason === 'maintenance' ? (
          <p>{block.message ?? 'Down for maintenance -- back shortly.'}</p>
        ) : (
          <>
            <p>A new version is available.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </>
        )}
      </div>
    </div>
  )
}

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
  onNewChat,
  onOpenHistory,
  onOpenDataSources,
  onSignOut,
}: {
  email: string
  onNewChat: () => void
  onOpenHistory: () => void
  onOpenDataSources: () => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      // composedPath(), not contains(event.target) -- the toggle button
      // swaps its own icon on this same click (burger -> bun-slice), which
      // removes event.target from the DOM before this handler runs. A
      // detached node is never "contained" by anything, even its former
      // parent, so contains() would read every open-click as outside and
      // close the menu immediately. composedPath() is captured at dispatch
      // time, before that swap, so it still reflects the real ancestry.
      if (ref.current && !event.composedPath().includes(ref.current)) {
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
        aria-label={open ? 'Close menu' : 'Menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Open state shows the bar's own trailing bun-slice instead of
            the closed burger -- the toggle IS that last bun once the
            burger's "layers" have spread out, not a separate rotated
            icon sitting next to them. The bar itself only draws the
            leading bun-slice now; this is the trailing one. */}
        {open ? <PixelBunSlice className="menu-bun" /> : <PixelBurger size={30} />}
      </button>
      {open && (
        <div className="app-menu-bar" role="menu" aria-label={`Account menu for ${email}`}>
          <PixelBunSlice className="menu-bun" />
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
            aria-label="New chat"
            onClick={() => {
              onNewChat()
              setOpen(false)
            }}
          >
            <PixelCompose size={22} />
          </button>
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
            aria-label="History"
            onClick={() => {
              onOpenHistory()
              setOpen(false)
            }}
          >
            <PixelHistory size={18} />
          </button>
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Knowledge Categories"
            onClick={() => {
              onOpenDataSources()
              setOpen(false)
            }}
          >
            <PixelNetwork size={18} />
          </button>
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
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

// Tapping the sprout opens a floating menu of features that stand on
// their own outside chat -- see docs/decisions and App's own comment on
// ObservationForm. New features get their own button here, same shape as
// AccountMenu's bar, just anchored off the header's left edge instead of
// its right.
function SproutMenu({
  onNewObservation,
  onOpenObservationLog,
  onOpenProducerData,
  onOpenObservationCandidates,
  onOpenArtifacts,
}: {
  onNewObservation: () => void
  onOpenObservationLog: () => void
  onOpenProducerData: () => void
  onOpenObservationCandidates: () => void
  onOpenArtifacts: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      // See AccountMenu's identical handler for why this is
      // composedPath() rather than contains(event.target).
      if (ref.current && !event.composedPath().includes(ref.current)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div className="sprout-menu" ref={ref}>
      <button
        type="button"
        className={`sprout-menu-toggle${open ? ' sprout-menu-toggle--open' : ''}`}
        aria-label="Features"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <PixelSprout size={44} />
      </button>
      {open && (
        <div className="sprout-menu-bar" role="menu" aria-label="Features">
          <button
            type="button"
            className="menu-icon-button"
            aria-label="New observation"
            onClick={() => {
              onNewObservation()
              setOpen(false)
            }}
          >
            <PixelPlus size={20} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Observation log"
            onClick={() => {
              onOpenObservationLog()
              setOpen(false)
            }}
          >
            <PixelHistory size={18} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Your vineyard data"
            onClick={() => {
              onOpenProducerData()
              setOpen(false)
            }}
          >
            <PixelGrid size={20} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Possible observations"
            onClick={() => {
              onOpenObservationCandidates()
              setOpen(false)
            }}
          >
            <PixelMagnifier size={20} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Shared artifacts"
            onClick={() => {
              onOpenArtifacts()
              setOpen(false)
            }}
          >
            <PixelPicture size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

function SignedIn({ session }: { session: Session }) {
  const [chatKey, setChatKey] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dataSourcesOpen, setDataSourcesOpen] = useState(false)
  const [observationFormOpen, setObservationFormOpen] = useState(false)
  const [observationLogOpen, setObservationLogOpen] = useState(false)
  const [producerDataOpen, setProducerDataOpen] = useState(false)
  const [observationCandidatesOpen, setObservationCandidatesOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [resumed, setResumed] = useState<Conversation | null>(null)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <SproutMenu
            onNewObservation={() => setObservationFormOpen(true)}
            onOpenObservationLog={() => setObservationLogOpen(true)}
            onOpenProducerData={() => setProducerDataOpen(true)}
            onOpenObservationCandidates={() => setObservationCandidatesOpen(true)}
            onOpenArtifacts={() => setArtifactsOpen(true)}
          />
        </div>
        <AccountMenu
          email={session.user.email ?? ''}
          onNewChat={() => {
            setResumed(null)
            setChatKey((k) => k + 1)
          }}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenDataSources={() => setDataSourcesOpen(true)}
          onSignOut={() => supabase.auth.signOut()}
        />
      </header>
      <Chat
        key={chatKey}
        session={session}
        initialMessages={resumed?.transcript}
        conversationId={resumed?.id}
      />
      {historyOpen && (
        <HistoryDrawer
          session={session}
          onClose={() => setHistoryOpen(false)}
          onContinue={(conversation) => {
            setResumed(conversation)
            setChatKey((k) => k + 1)
            setHistoryOpen(false)
          }}
        />
      )}
      {dataSourcesOpen && <DataSourcesView session={session} onClose={() => setDataSourcesOpen(false)} />}
      {observationFormOpen && (
        <ObservationForm session={session} onClose={() => setObservationFormOpen(false)} />
      )}
      {observationLogOpen && <ObservationLogView onClose={() => setObservationLogOpen(false)} />}
      {producerDataOpen && <ProducerDataView onClose={() => setProducerDataOpen(false)} />}
      {observationCandidatesOpen && (
        <ObservationCandidatesView session={session} onClose={() => setObservationCandidatesOpen(false)} />
      )}
      {artifactsOpen && <ArtifactsView onClose={() => setArtifactsOpen(false)} />}
      <ReleaseNotes session={session} />
    </div>
  )
}

// Every screen below this assumes profiles.producer_id exists -- nothing
// creates that row automatically (see docs/decisions/0026), so this is
// still the one gate deciding whether a signed-in account has a producer
// at all. What changed is what happens when it doesn't.
//
// 0026's self-serve wizard used to run here: name your vineyard,
// optionally add a first parcel. It was withdrawn in UAT. Two reasons,
// and the second is the real one. It could not be tested by the only
// account that exists -- the gate is "has a profile", the owner has one,
// so the wizard was unreachable for the person who had to sign it off.
// And the shape of it is about to be wrong anyway: parcels are becoming
// the thing Growdy sells, and the seat someone buys, so the first run of
// a new account is going to be a purchase and a GIS-drawn boundary, not
// a text box asking for a vineyard name.
//
// Rather than leave a wizard that creates the wrong shape of account, an
// account with no producer now says so plainly and stops. Growdy has one
// producer and a waiting list of nobody, so this costs nothing today,
// and it fails honestly instead of half-working. create_producer_and_profile
// is deliberately left in the database: it is how a producer gets created
// by hand in the meantime, and the purchase flow will want it back.
function SessionRouter({ session }: { session: Session }) {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setHasProfile(data !== null))
  }, [session.user.id])

  if (hasProfile === null) return null
  if (!hasProfile) return <NoProducerScreen />
  return <SignedIn session={session} />
}

// The honest dead end described above. Signing out is the only action,
// because it's the only one that would actually help.
function NoProducerScreen() {
  return (
    <div className="login-screen">
      <div className="login-content">
        <span className="app-icon" role="img" aria-label="growdy">
          <PixelSprout size={56} />
        </span>
        <h1>growdy</h1>
        <p>This account isn't attached to a vineyard yet.</p>
        <p>Growdy isn't open for self-serve sign-up at the moment. If you're expecting access, get in touch and we'll set you up.</p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}

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
