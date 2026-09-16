import { Fragment, useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

type Parcel = { id: string; name: string }
type Plot = { id: string; name: string }
type PlotRow = { id: string; number: number }
type CellStatus = 'planted' | 'blocked' | 'open'
type Cell = { status: CellStatus; plantingId: string }

const MIN_CELL = 6
const MAX_CELL = 28
const DEFAULT_CELL = 14

// One dot per position, colored by position_status -- the same
// planted/blocked/open derivation the tree's own status dots use, just
// laid out spatially instead of behind an expand click, so a whole
// plot's health reads at a glance instead of row by row. Zoom is a plain
// range input driving --cell-size; a real plot is easily 100 positions
// wide, so the grid also scrolls in both directions rather than trying
// to force everything into one screen.
export function ProducerDataGrid({ onSelectPlanting }: { onSelectPlanting: (id: string) => void }) {
  const [parcels, setParcels] = useState<Parcel[] | null>(null)
  const [parcelId, setParcelId] = useState<string | null>(null)
  const [plots, setPlots] = useState<Plot[] | null>(null)
  const [plotId, setPlotId] = useState<string | null>(null)
  const [rows, setRows] = useState<PlotRow[] | null>(null)
  const [cellsByRow, setCellsByRow] = useState<Map<string, Map<number, Cell>>>(new Map())
  const [maxPosition, setMaxPosition] = useState(0)
  const [cellSize, setCellSize] = useState(DEFAULT_CELL)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('parcels')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        const list = (data as Parcel[]) ?? []
        setParcels(list)
        setParcelId(list[0]?.id ?? null)
      })
  }, [])

  useEffect(() => {
    if (!parcelId) return
    supabase
      .from('plots')
      .select('id, name')
      .eq('parcel_id', parcelId)
      .order('name')
      .then(({ data }) => {
        const list = (data as Plot[]) ?? []
        setPlots(list)
        setPlotId(list[0]?.id ?? null)
      })
  }, [parcelId])

  useEffect(() => {
    if (!plotId) {
      setRows(null)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: rowData } = await supabase.from('plot_rows').select('id, number').eq('plot_id', plotId).order('number')
      const rowList = (rowData as PlotRow[]) ?? []
      if (cancelled) return
      setRows(rowList)

      if (rowList.length === 0) {
        setCellsByRow(new Map())
        setMaxPosition(0)
        setLoading(false)
        return
      }

      const { data: statusData } = await supabase
        .from('position_status')
        .select('plot_row_id, position, status, planting_id')
        .in(
          'plot_row_id',
          rowList.map((r) => r.id),
        )
      if (cancelled) return

      const byRow = new Map<string, Map<number, Cell>>()
      let max = 0
      for (const raw of (statusData as { plot_row_id: string; position: number; status: CellStatus; planting_id: string }[]) ?? []) {
        if (!byRow.has(raw.plot_row_id)) byRow.set(raw.plot_row_id, new Map())
        byRow.get(raw.plot_row_id)!.set(raw.position, { status: raw.status, plantingId: raw.planting_id })
        if (raw.position > max) max = raw.position
      }
      setCellsByRow(byRow)
      setMaxPosition(max)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [plotId])

  const positions = Array.from({ length: maxPosition }, (_, i) => i + 1)

  return (
    <div className="pdv-grid-view">
      <div className="pdv-grid-controls">
        <label>
          Parcel
          <select value={parcelId ?? ''} onChange={(e) => setParcelId(e.target.value)}>
            {parcels?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plot
          <select value={plotId ?? ''} onChange={(e) => setPlotId(e.target.value)}>
            {plots?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pdv-zoom">
          Zoom
          <input
            type="range"
            min={MIN_CELL}
            max={MAX_CELL}
            value={cellSize}
            onChange={(e) => setCellSize(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="pdv-grid-legend">
        <span>
          <span className="pdv-dot pdv-dot--planted" /> Planted
        </span>
        <span>
          <span className="pdv-dot pdv-dot--blocked" /> Blocked
        </span>
        <span>
          <span className="pdv-dot pdv-dot--open" /> Open
        </span>
      </div>

      {loading && <p className="pdv-empty">Loading...</p>}
      {!loading && rows !== null && rows.length === 0 && <p className="pdv-empty">No rows in this plot yet.</p>}

      {!loading && rows !== null && rows.length > 0 && (
        <div className="pdv-grid-scroll">
          <div
            className="pdv-grid"
            style={{
              gridTemplateColumns: `40px repeat(${maxPosition}, ${cellSize}px)`,
              gridAutoRows: `${cellSize}px`,
            }}
          >
            <div className="pdv-grid-corner" />
            {positions.map((pos) => (
              <div key={`h-${pos}`} className="pdv-grid-col-label">
                {pos % 10 === 0 ? pos : ''}
              </div>
            ))}
            {rows.map((row) => {
              const cells = cellsByRow.get(row.id)
              return (
                <Fragment key={row.id}>
                  <div className="pdv-grid-row-label">{row.number}</div>
                  {positions.map((pos) => {
                    const cell = cells?.get(pos)
                    return (
                      <button
                        key={pos}
                        type="button"
                        className={`pdv-grid-cell${cell ? ` pdv-grid-cell--${cell.status}` : ' pdv-grid-cell--empty'}`}
                        disabled={!cell}
                        aria-label={cell ? `Row ${row.number}, position ${pos}, ${cell.status}` : undefined}
                        onClick={() => cell && onSelectPlanting(cell.plantingId)}
                      />
                    )
                  })}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
