import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { AccountMenu } from '@/app/AccountMenu'
import { NewChatButton } from '@/app/NewChatButton'
import { ArtifactsView } from '@/features/artifacts/ArtifactsView'
import { Chat } from '@/features/chat/Chat'
import { HistoryDrawer, type Conversation } from '@/features/chat/HistoryDrawer'
import { ObservationCandidatesView } from '@/features/observations/ObservationCandidatesView'
import { ObservationForm } from '@/features/observations/ObservationForm'
import { ObservationLogView } from '@/features/observations/ObservationLogView'
import { DataSourcesView } from '@/features/producer/DataSourcesView'
import { ProducerDataView } from '@/features/producer/ProducerDataView'
import { ReleaseNotes } from '@/features/releases/ReleaseNotes'
import { supabase } from '@/lib/supabaseClient'

export function SignedIn({ session }: { session: Session }) {
  const [chatKey, setChatKey] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dataSourcesOpen, setDataSourcesOpen] = useState(false)
  const [observationFormOpen, setObservationFormOpen] = useState(false)
  const [observationLogOpen, setObservationLogOpen] = useState(false)
  const [producerDataOpen, setProducerDataOpen] = useState(false)
  const [observationCandidatesOpen, setObservationCandidatesOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [resumed, setResumed] = useState<Conversation | null>(null)
  // Whether this chat has anything in it. Held here rather than in Chat
  // because the button that reads it lives in the header, and Chat is
  // remounted by key every time the subject changes -- so the two things
  // that reset it, starting over and resuming something, are both right
  // here already.
  const [chatStarted, setChatStarted] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  // The header floats over the messages rather than sitting above them,
  // so a conversation scrolls up under the Dynamic Island the way it
  // should instead of stopping at a hard edge below the logo. That means
  // the scroll area has to reserve the header's height itself -- the
  // same arrangement as the compose bar at the other end, and measured
  // for the same reason: a number typed in here would be wrong the first
  // time the header gains a row.
  useEffect(() => {
    const header = headerRef.current
    const shell = shellRef.current
    if (!header || !shell) return
    const apply = () => shell.style.setProperty('--header-height', `${header.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // Whether something is sitting on top of the menu. The menu stays open
  // underneath a screen it opened, so that shutting the screen puts the
  // producer back where they were rather than in front of a closed
  // burger they have to open again to reach the next thing -- and while
  // it is under there, a tap inside that screen must not be read as a
  // tap outside the menu.
  const screenOpen =
    historyOpen ||
    dataSourcesOpen ||
    observationFormOpen ||
    observationLogOpen ||
    producerDataOpen ||
    observationCandidatesOpen ||
    artifactsOpen

  /**
   * Swap the conversation, with the swap actually visible.
   *
   * Remounting Chat on a new key is the right mechanism -- it is what
   * gives the next conversation an empty transcript, and nothing is lost
   * because useConversationLog has already written the old one. But a
   * remount is instantaneous, so what a producer saw was their
   * conversation replaced between two frames with no indication that a
   * thing had happened rather than a thing had broken.
   *
   * A view transition is the browser doing the work: it snapshots the
   * old element, applies the change, snapshots the new one, and
   * cross-fades between them. React has to apply that change
   * synchronously inside the callback or the browser snapshots a tree
   * that has not updated yet, which is what flushSync is for here.
   *
   * Guarded rather than assumed -- the API is recent, and on anything
   * that lacks it the swap simply happens the way it always did.
   */
  function swapConversation(change: () => void) {
    if (typeof document.startViewTransition !== 'function') {
      change()
      return
    }
    document.startViewTransition(() => flushSync(change))
  }

  function startNewChat() {
    swapConversation(() => {
      setResumed(null)
      setChatStarted(false)
      setChatKey((k) => k + 1)
    })
  }

  return (
    <div className="app-shell" ref={shellRef}>
      <header className="app-header" ref={headerRef}>
        <div className="app-header-left">
          <NewChatButton onNewChat={startNewChat} shown={chatStarted} />
        </div>
        <AccountMenu
          email={session.user.email ?? ''}
          covered={screenOpen}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenDataSources={() => setDataSourcesOpen(true)}
          onSignOut={() => supabase.auth.signOut()}
          onNewObservation={() => setObservationFormOpen(true)}
          onOpenObservationLog={() => setObservationLogOpen(true)}
          onOpenProducerData={() => setProducerDataOpen(true)}
          onOpenObservationCandidates={() => setObservationCandidatesOpen(true)}
          onOpenArtifacts={() => setArtifactsOpen(true)}
        />
      </header>
      <Chat
        key={chatKey}
        session={session}
        initialMessages={resumed?.transcript}
        conversationId={resumed?.id}
        onStarted={() => setChatStarted(true)}
      />
      {historyOpen && (
        <HistoryDrawer
          session={session}
          onClose={() => setHistoryOpen(false)}
          onContinue={(conversation) => {
            setHistoryOpen(false)
            swapConversation(() => {
              setResumed(conversation)
              // Resuming arrives with a transcript already in it, so it
              // is started by definition and never passes through send().
              setChatStarted(true)
              setChatKey((k) => k + 1)
            })
          }}
        />
      )}
      {dataSourcesOpen && <DataSourcesView session={session} onClose={() => setDataSourcesOpen(false)} />}
      {observationFormOpen && (
        <ObservationForm session={session} onClose={() => setObservationFormOpen(false)} />
      )}
      {observationLogOpen && <ObservationLogView session={session} onClose={() => setObservationLogOpen(false)} />}
      {producerDataOpen && <ProducerDataView onClose={() => setProducerDataOpen(false)} />}
      {observationCandidatesOpen && (
        <ObservationCandidatesView
          session={session}
          onClose={() => setObservationCandidatesOpen(false)}
          onOpenLog={() => {
            setObservationCandidatesOpen(false)
            setObservationLogOpen(true)
          }}
        />
      )}
      {artifactsOpen && <ArtifactsView onClose={() => setArtifactsOpen(false)} />}
      <ReleaseNotes session={session} />
    </div>
  )
}
