import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { PixelSprout } from '@/ui/icons'
import { sanitizeSvg } from '@/lib/sanitizeSvg'

type Artifact = { title: string | null; content: string; created_at: string }

// The one page in this app a signed-out visitor can reach (see
// docs/decisions/0027) -- App.tsx renders this before any auth check
// runs at all, for a URL like /a/<uuid>. Sanitizes on every read, the
// same DOMPurify call SvgGraphic already uses for the in-chat copy --
// content is stored raw, never trusted as pre-sanitized just because
// it's already in the database.
export function PublicArtifactView({ id }: { id: string }) {
  const [state, setState] = useState<'loading' | 'not-found' | { artifact: Artifact }>('loading')

  useEffect(() => {
    supabase
      .rpc('get_public_artifact', { p_id: id })
      .then(({ data }) => {
        const row = (data as Artifact[] | null)?.[0]
        setState(row ? { artifact: row } : 'not-found')
      })
  }, [id])

  if (state === 'loading') return null

  if (state === 'not-found') {
    return (
      <div className="login-screen">
        <div className="login-content">
          <span className="app-icon" role="img" aria-label="growdy">
            <PixelSprout size={56} />
          </span>
          <h1>growdy</h1>
          <p>This link doesn't point to anything -- it may have been removed.</p>
        </div>
      </div>
    )
  }

  const clean = sanitizeSvg(state.artifact.content)

  return (
    <div className="public-artifact-page">
      <header className="public-artifact-header">
        <PixelSprout size={24} />
        <span>growdy</span>
      </header>
      <div className="public-artifact-body">
        {clean && clean.includes('<svg') ? (
          <div className="public-artifact-graphic" dangerouslySetInnerHTML={{ __html: clean }} />
        ) : (
          <pre className="chat-graphic-fallback">{state.artifact.content}</pre>
        )}
      </div>
    </div>
  )
}
