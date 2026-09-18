import { useEffect, useState } from 'react'
import { signedPhotoUrl } from './lib/photo'

// The bucket is private (see the storage migration), so a photo can't be
// rendered from its path -- every view has to mint a signed URL first,
// and they expire. That's one behaviour, wanted in at least three places
// (the review queue, the observation log, and whatever shows a photo
// next), so it lives here rather than being re-derived each time with
// its own idea of how long a URL should last.
//
// A failed signature renders nothing rather than a broken-image icon.
// The path is stored on the row, so a photo that can't be fetched is a
// storage or permissions problem worth seeing as absence, not as a
// glyph that looks like the photo itself was bad.
export function ObservationPhoto({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    signedPhotoUrl(path)
      .then((signed) => {
        if (!active) return
        if (signed) setUrl(signed)
        else setFailed(true)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [path])

  if (failed) return <span className="observation-photo-missing">Photo unavailable</span>
  if (!url) return <span className="observation-photo-loading" aria-hidden="true" />

  return <img className="observation-photo" src={url} alt={alt} loading="lazy" />
}
