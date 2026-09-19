import { useEffect, useState } from 'react'
import { deleteArtifact, listArtifacts, type Artifact } from '@/data/artifacts'
import { sanitizeSvg } from '@/lib/sanitizeSvg'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ArtifactThumbnail({ content }: { content: string }) {
  const clean = sanitizeSvg(content)
  if (!clean || !clean.includes('<svg')) return <div className="artifacts-thumb artifacts-thumb--empty" />
  return <div className="artifacts-thumb" dangerouslySetInnerHTML={{ __html: clean }} />
}

// The bottom-sheet/modal detail, opened from a card -- same shape
// PlantingDetail already established for "tap a card, see it full-size
// with actions" (.pdv-detail-*). Copy/delete both live here, not on the
// card itself, so the grid stays uncluttered.
function ArtifactDetail({
  artifact,
  onClose,
  onDeleted,
}: {
  artifact: Artifact
  onClose: () => void
  onDeleted: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const shareUrl = `${window.location.origin}/a/${artifact.id}`
  const clean = sanitizeSvg(artifact.content)

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    await deleteArtifact(artifact.id)
    setDeleting(false)
    onDeleted()
  }

  return (
    <div className="pdv-detail-overlay" onClick={onClose}>
      <div className="pdv-detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="pdv-detail-header">
          <h3>{artifact.title || 'Untitled'}</h3>
          <button type="button" className="pdv-detail-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="pdv-detail-body">
          {clean && clean.includes('<svg') ? (
            <div className="artifacts-detail-graphic" dangerouslySetInnerHTML={{ __html: clean }} />
          ) : (
            <pre className="chat-graphic-fallback">{artifact.content}</pre>
          )}
          <p className="artifacts-detail-date">Shared {formatDate(artifact.created_at)}</p>
          <div className="artifacts-share-link">
            <input type="text" readOnly value={shareUrl} onClick={(e) => e.currentTarget.select()} />
            <button type="button" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {confirmingDelete ? (
            <div className="artifacts-delete-confirm">
              <span>Delete this link? Anyone who has it will lose access.</span>
              <div className="artifacts-delete-confirm-actions">
                <button type="button" className="artifacts-delete-confirm-yes" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="artifacts-delete-toggle" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// A producer's own saved artifacts (0027) -- everything they've ever
// shared from the chat, browsable and manageable in one place. Reuses
// ProducerDataView's modern visual language (.pdv-*) rather than the
// pixel-art chat chrome, the same "a real browsing tool reads better
// dense than playful" reasoning that view already established.
export function ArtifactsView({ onClose }: { onClose: () => void }) {
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null)
  const [selected, setSelected] = useState<Artifact | null>(null)

  function refresh() {
    listArtifacts().then(setArtifacts)
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="pdv-overlay">
      <div className="pdv-header">
        <h2>Shared Artifacts</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="pdv-close">
          &times;
        </button>
      </div>
      <div className="pdv-body">
        {artifacts === null && <p className="pdv-empty">Loading...</p>}
        {artifacts !== null && artifacts.length === 0 && (
          <p className="pdv-empty">Nothing shared yet -- tap "Share" on a picture the chat draws to save one here.</p>
        )}
        <div className="artifacts-grid">
          {artifacts?.map((a) => (
            <button type="button" key={a.id} className="artifacts-card" onClick={() => setSelected(a)}>
              <ArtifactThumbnail content={a.content} />
              <span className="artifacts-card-title">{a.title || 'Untitled'}</span>
              <span className="artifacts-card-date">{formatDate(a.created_at)}</span>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <ArtifactDetail
          artifact={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
