import { useEffect, useState } from 'react'
import { listObservationsForPlanting, type Observation } from '@/data/observations'
import { fetchPlanting, type PlantingDetails as PlantingFull } from '@/data/vineyard'

function plantingStatus(p: PlantingFull): { label: string; tone: 'planted' | 'blocked' | 'open' } {
  if (p.removed_date) return { label: 'Removed', tone: 'open' }
  if (p.dead_date) return { label: 'Blocked (dead, not cleared)', tone: 'blocked' }
  return { label: 'Planted', tone: 'planted' }
}

function varietyLine(p: PlantingFull): string {
  if (p.variety) return p.variety
  if (p.scion || p.rootstock) return `${p.scion ?? 'unknown scion'} / ${p.rootstock ?? 'unknown rootstock'}`
  return 'Unlabeled'
}

// Shared master-detail panel for both the tree and grid views -- a
// planting_id is all either caller has for sure (the tree already has
// the readable fields in hand, the grid only has the id off a clicked
// dot), so this always does its own full fetch rather than accepting
// optional preloaded props for one caller. One fetch is cheap; two
// slightly different code paths through the same component isn't worth
// avoiding it.
export function PlantingDetail({ plantingId, onClose }: { plantingId: string; onClose: () => void }) {
  const [planting, setPlanting] = useState<PlantingFull | null>(null)
  const [observations, setObservations] = useState<Observation[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // No reset of planting/observations/error here on purpose: the sheet
  // is mounted with key={plantingId} (see ProducerDataView), so picking
  // a different planting remounts it with fresh state rather than
  // clearing three pieces of it by hand on the way in -- which is both
  // what React's key is for and one less way to show the last
  // planting's history under this one's name.
  useEffect(() => {
    let cancelled = false

    fetchPlanting(plantingId)
      .then((found) => {
        if (!cancelled) setPlanting(found)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this planting.')
      })

    listObservationsForPlanting(plantingId)
      .then((found) => {
        if (!cancelled) setObservations(found)
      })
      .catch(() => {
        // The planting's own error is the one worth showing; an empty
        // history reads as "nothing recorded yet" either way.
        if (!cancelled) setObservations([])
      })

    return () => {
      cancelled = true
    }
  }, [plantingId])

  const status = planting ? plantingStatus(planting) : null

  return (
    <div className="pdv-detail-overlay" onClick={onClose}>
      <div className="pdv-detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="pdv-detail-header">
          <h3>{planting?.label ?? planting?.nickname ?? (planting ? varietyLine(planting) : 'Planting')}</h3>
          <button type="button" className="pdv-detail-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="pdv-detail-body">
          {error && <p className="pdv-error">{error}</p>}
          {!planting && !error && <p className="pdv-empty">Loading...</p>}
          {planting && status && (
            <>
              <div className="pdv-detail-fields">
                <div className="pdv-detail-field">
                  <span className="pdv-detail-field-label">Status</span>
                  <span className={`pdv-status-badge pdv-status-badge--${status.tone}`}>{status.label}</span>
                </div>
                <div className="pdv-detail-field">
                  <span className="pdv-detail-field-label">Location</span>
                  <span>{planting.label ?? `${planting.parcel} (unplotted)`}</span>
                </div>
                <div className="pdv-detail-field">
                  <span className="pdv-detail-field-label">Variety</span>
                  <span>{varietyLine(planting)}</span>
                </div>
                {planting.nickname && (
                  <div className="pdv-detail-field">
                    <span className="pdv-detail-field-label">Nickname</span>
                    <span>{planting.nickname}</span>
                  </div>
                )}
                <div className="pdv-detail-field">
                  <span className="pdv-detail-field-label">Planted</span>
                  <span>{planting.planted_date ?? 'Unknown'}</span>
                </div>
                {planting.dead_date && (
                  <div className="pdv-detail-field">
                    <span className="pdv-detail-field-label">Dead since</span>
                    <span>{planting.dead_date}</span>
                  </div>
                )}
                {planting.removed_date && (
                  <div className="pdv-detail-field">
                    <span className="pdv-detail-field-label">Removed</span>
                    <span>
                      {planting.removed_date}
                      {planting.removed_reason ? ` -- ${planting.removed_reason}` : ''}
                    </span>
                  </div>
                )}
              </div>

              <h4 className="pdv-detail-subheading">Observations</h4>
              {observations === null && <p className="pdv-empty">Loading...</p>}
              {observations !== null && observations.length === 0 && (
                <p className="pdv-empty">No observations logged for this planting yet.</p>
              )}
              {observations !== null && observations.length > 0 && (
                <ul className="pdv-observation-list">
                  {observations.map((o) => (
                    <li key={o.id} className="pdv-observation-item">
                      <div className="pdv-observation-meta">
                        <span>{o.observed_date ?? new Date(o.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="pdv-observation-note">{o.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
