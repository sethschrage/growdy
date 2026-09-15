import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

type Parcel = { id: string; name: string }
type Plot = { id: string; name: string }
type PlotRow = { id: string; number: number }

type Planting = {
  id: string
  position: number | null
  nickname: string | null
  variety: string | null
  scion: string | null
  rootstock: string | null
  dead_date: string | null
}

function plantingLabel(p: Planting): string {
  if (p.nickname) return p.nickname
  if (p.variety) return p.variety
  if (p.scion || p.rootstock) return `${p.scion ?? '?'} / ${p.rootstock ?? '?'}`
  return 'Unlabeled'
}

// Read-only for now, and scoped to currently-active plantings
// (removed_date is null) -- a row's full replant history is real data
// but not what "what's out there right now" browsing needs; see
// position_status's own "only the latest planting matters" reasoning in
// 20260913012451_position_status_view.sql.
export function ProducerDataView({ onClose }: { onClose: () => void }) {
  const [parcels, setParcels] = useState<Parcel[] | null>(null)
  const [plots, setPlots] = useState<Plot[] | null>(null)
  const [rows, setRows] = useState<PlotRow[] | null>(null)
  const [plantings, setPlantings] = useState<Planting[] | null>(null)

  const [parcel, setParcel] = useState<Parcel | null>(null)
  const [plot, setPlot] = useState<Plot | null>(null)
  const [row, setRow] = useState<PlotRow | null>(null)

  useEffect(() => {
    supabase
      .from('parcels')
      .select('id, name')
      .order('name')
      .then(({ data }) => setParcels((data as Parcel[]) ?? []))
  }, [])

  useEffect(() => {
    if (!parcel) return
    setPlots(null)
    supabase
      .from('plots')
      .select('id, name')
      .eq('parcel_id', parcel.id)
      .order('name')
      .then(({ data }) => setPlots((data as Plot[]) ?? []))
  }, [parcel])

  useEffect(() => {
    if (!plot) return
    setRows(null)
    supabase
      .from('plot_rows')
      .select('id, number')
      .eq('plot_id', plot.id)
      .order('number')
      .then(({ data }) => setRows((data as PlotRow[]) ?? []))
  }, [plot])

  useEffect(() => {
    if (!plot || !row) return
    setPlantings(null)
    supabase
      .from('planting_readable')
      .select('id, position, nickname, variety, scion, rootstock, dead_date')
      .eq('plot', plot.name)
      .eq('row_number', row.number)
      .is('removed_date', null)
      .order('position')
      .then(({ data }) => setPlantings((data as Planting[]) ?? []))
  }, [plot, row])

  const title = row ? `Row ${row.number}` : plot ? plot.name : parcel ? parcel.name : 'Your Vineyard Data'

  return (
    <div className="producer-data-overlay">
      <div className="producer-data-header">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="producer-data-close">
          &times;
        </button>
      </div>
      <div className="producer-data-body">
        {row ? (
          <button
            type="button"
            className="producer-data-back"
            onClick={() => {
              setRow(null)
              setPlantings(null)
            }}
          >
            &larr; {plot?.name}
          </button>
        ) : plot ? (
          <button
            type="button"
            className="producer-data-back"
            onClick={() => {
              setPlot(null)
              setRows(null)
            }}
          >
            &larr; {parcel?.name}
          </button>
        ) : parcel ? (
          <button
            type="button"
            className="producer-data-back"
            onClick={() => {
              setParcel(null)
              setPlots(null)
            }}
          >
            &larr; Parcels
          </button>
        ) : null}

        {parcels === null && <p className="history-empty">Loading...</p>}

        {parcels && !parcel && (
          <ul className="producer-data-list">
            {parcels.length === 0 && <p className="history-empty">No parcels yet.</p>}
            {parcels.map((p) => (
              <li key={p.id}>
                <button type="button" className="producer-data-nav-item" onClick={() => setParcel(p)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {parcel && !plot && (
          <ul className="producer-data-list">
            {plots === null && <p className="history-empty">Loading...</p>}
            {plots !== null && plots.length === 0 && <p className="history-empty">No plots in this parcel yet.</p>}
            {plots?.map((p) => (
              <li key={p.id}>
                <button type="button" className="producer-data-nav-item" onClick={() => setPlot(p)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {plot && !row && (
          <ul className="producer-data-list">
            {rows === null && <p className="history-empty">Loading...</p>}
            {rows !== null && rows.length === 0 && <p className="history-empty">No rows in this plot yet.</p>}
            {rows?.map((r) => (
              <li key={r.id}>
                <button type="button" className="producer-data-nav-item" onClick={() => setRow(r)}>
                  Row {r.number}
                </button>
              </li>
            ))}
          </ul>
        )}

        {row && (
          <ul className="producer-data-planting-list">
            {plantings === null && <p className="history-empty">Loading...</p>}
            {plantings !== null && plantings.length === 0 && (
              <p className="history-empty">No active plantings in this row.</p>
            )}
            {plantings?.map((p) => (
              <li key={p.id} className="producer-data-planting-item">
                <span className="producer-data-planting-position">{p.position ?? '—'}</span>
                <span className="producer-data-planting-label">{plantingLabel(p)}</span>
                <span className="producer-data-planting-status">
                  {p.dead_date ? 'Blocked' : 'Planted'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
