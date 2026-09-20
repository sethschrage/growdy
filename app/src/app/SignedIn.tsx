import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AccountMenu } from '@/app/AccountMenu'
import { SproutMenu } from '@/app/SproutMenu'
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

  return (
    <div className="app-shell" ref={shellRef}>
      <header className="app-header" ref={headerRef}>
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
