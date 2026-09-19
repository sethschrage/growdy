import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import { fetchLastSeenRelease, markReleaseSeen } from '@/data/profile'

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
// The GitHub Release's own body is a short, producer-facing bullet list
// (see CONTRIBUTING.md) -- deliberately not the same text as CHANGELOG.md's
// prose entry for the same version, which stays internal engineering
// history and is never fetched here. Rendered through react-markdown (the
// same renderer MessageContent already uses) so the bullets actually
// render as a list, not a paragraph with literal "-" characters in it.
//
// Only the single latest release ever shows here -- fetching the full
// history and rendering every release since profiles.last_seen_release
// was tried first and was immediately too long to be worth reading, even
// with short bullets, once more than one release had gone by. A producer
// who skips several releases just sees what's newest, not everything
// they missed in between; that trade-off was made deliberately, not
// overlooked.
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

    fetchLastSeenRelease(session.user.id)
      .then(setLastSeen)
      // Undefined means "not known yet" and holds the banner back;
      // null means "never dismissed one". A failed lookup is closer to
      // the second: showing What's new twice is a smaller mistake than
      // a banner that never renders again.
      .catch(() => setLastSeen(null))
  }, [session.user.id])

  const latest = releases?.[0] ?? null
  const shouldShow = releases !== null && lastSeen !== undefined && latest !== null && lastSeen !== latest.tag_name

  async function dismiss() {
    if (!latest) return
    setDismissing(true)
    await markReleaseSeen(session.user.id, latest.tag_name)
    setDismissing(false)
    setLastSeen(latest.tag_name)
  }

  if (!shouldShow || !latest) return null

  return (
    <div className="release-notes-overlay">
      <div className="release-notes-panel">
        <h2>What's new</h2>
        <div className="release-notes-list">
          <div className="release-notes-item">
            <h3>{latest.name || latest.tag_name}</h3>
            <p className="release-notes-date">
              {new Date(latest.published_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <div className="release-notes-body">
              <ReactMarkdown>{latest.body}</ReactMarkdown>
            </div>
          </div>
        </div>
        <button type="button" onClick={dismiss} disabled={dismissing}>
          {dismissing ? 'Saving...' : 'Got it'}
        </button>
      </div>
    </div>
  )
}
