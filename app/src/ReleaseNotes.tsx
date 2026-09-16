import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

type Release = {
  tag_name: string
  name: string
  body: string
  published_at: string
}

const RELEASES_URL = 'https://api.github.com/repos/sethschrage/growdy/releases'

// Release notes already have one real home -- GitHub Releases (see
// CONTRIBUTING.md's Releases process) -- so this reads them directly from
// GitHub's public API rather than duplicating them into a second table
// that could drift out of sync with the real history. profiles.last_seen_release
// is the only piece of state that actually belongs to us: which release a
// given producer has acknowledged, not what the releases themselves say.
//
// The same shape (fetch some content, show it once, remember it's been
// seen) is exactly what an onboarding wizard would need too -- worth
// generalizing into a shared component once there's a second real case,
// not speculatively now for a single user of the pattern.
export function ReleaseNotes({ session }: { session: Session }) {
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    fetch(RELEASES_URL)
      .then((r) => (r.ok ? r.json() : []))
      .then(setReleases)
      .catch(() => setReleases([]))

    supabase
      .from('profiles')
      .select('last_seen_release')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setLastSeen(data?.last_seen_release ?? null))
  }, [session.user.id])

  const latest = releases?.[0] ?? null
  const shouldShow = releases !== null && lastSeen !== undefined && latest !== null && lastSeen !== latest.tag_name

  async function dismiss() {
    if (!latest) return
    setDismissing(true)
    await supabase.from('profiles').update({ last_seen_release: latest.tag_name }).eq('id', session.user.id)
    setDismissing(false)
    setLastSeen(latest.tag_name)
  }

  if (!shouldShow) return null

  return (
    <div className="release-notes-overlay">
      <div className="release-notes-panel">
        <h2>What's new</h2>
        <div className="release-notes-list">
          {releases!.map((release) => (
            <div key={release.tag_name} className="release-notes-item">
              <h3>{release.name || release.tag_name}</h3>
              <p className="release-notes-date">
                {new Date(release.published_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p className="release-notes-body">{release.body}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={dismiss} disabled={dismissing}>
          {dismissing ? 'Saving...' : 'Got it'}
        </button>
      </div>
    </div>
  )
}
