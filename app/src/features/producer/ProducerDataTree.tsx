import { useEffect, useState } from 'react'
import {
  listParcels,
  listPlotRows,
  listPlots,
  listRowPlantings,
  updatePlotRow,
  type Parcel,
  type Plot,
  type PlotRow,
  type RowPlanting as Planting,
} from '@/data/vineyard'

function plantingLabel(p: Planting): string {
  if (p.nickname) return p.nickname
  if (p.variety) return p.variety
  if (p.scion || p.rootstock) return `${p.scion ?? '?'} / ${p.rootstock ?? '?'}`
  return 'Unlabeled'
}

function plantingStatus(p: Planting): 'planted' | 'blocked' {
  return p.dead_date ? 'blocked' : 'planted'
}

function rowMeasurementsSummary(row: PlotRow): string {
  const parts: string[] = []
  if (row.length_meters != null) parts.push(`${row.length_meters}m long`)
  if (row.spacing_meters != null) parts.push(`${row.spacing_meters}m spacing`)
  if (row.end_post_count != null) parts.push(`${row.end_post_count} end posts`)
  return parts.length > 0 ? parts.join(' · ') : 'No measurements recorded'
}

// A row's physical measurements (length, spacing, end-post count) --
// nullable, editor/owner-only (see the plot_rows RLS policy for why a
// producer's own rows). This is the first editable
// field anywhere in this read-only tree, so it gets its own small inline
// form rather than an "edit mode" the rest of the tree doesn't need.
function RowMeasurements({
  plot,
  row,
  onSave,
}: {
  plot: Plot
  row: PlotRow
  onSave: (plot: Plot, row: PlotRow, updated: Partial<PlotRow>) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [length, setLength] = useState(row.length_meters?.toString() ?? '')
  const [spacing, setSpacing] = useState(row.spacing_meters?.toString() ?? '')
  const [endPosts, setEndPosts] = useState(row.end_post_count?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!editing) {
    return (
      <div className="pdv-row-measurements">
        <span className="pdv-row-measurements-summary">{rowMeasurementsSummary(row)}</span>
        <button type="button" className="pdv-row-measurements-edit" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await onSave(plot, row, {
      length_meters: length === '' ? null : Number(length),
      spacing_meters: spacing === '' ? null : Number(spacing),
      end_post_count: endPosts === '' ? null : Number(endPosts),
    })
    setSaving(false)
    if (result) setError(result)
    else setEditing(false)
  }

  return (
    <form
      className="pdv-row-measurements pdv-row-measurements--editing"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      {/* inputMode as well as type. type="number" is what validates;
          inputMode is what iOS reads when it decides which keyboard to
          raise, and without it these three fields get the full QWERTY
          with the digits two taps away. Metres want a decimal point,
          posts are whole things. */}
      <label>
        Length (m)
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={length}
          onChange={(e) => setLength(e.target.value)}
        />
      </label>
      <label>
        Spacing (m)
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={spacing}
          onChange={(e) => setSpacing(e.target.value)}
        />
      </label>
      <label>
        End posts
        <input
          type="number"
          inputMode="numeric"
          step="1"
          value={endPosts}
          onChange={(e) => setEndPosts(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="pdv-row-measurements-actions">
        <button type="submit" disabled={saving}>
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// A real collapsible tree, not a level-by-level button drill-down: every
// node expands in place and stays expanded alongside its siblings, so
// comparing two rows (or two plots) means opening both, not bouncing
// back and forth. Each level fetches its children lazily, on first
// expand, and caches them in a Map keyed by parent id -- collapsing and
// re-expanding a node doesn't refetch.
export function ProducerDataTree({ onSelectPlanting }: { onSelectPlanting: (id: string) => void }) {
  const [parcels, setParcels] = useState<Parcel[] | null>(null)
  const [plotsByParcel, setPlotsByParcel] = useState<Map<string, Plot[]>>(new Map())
  const [rowsByPlot, setRowsByPlot] = useState<Map<string, PlotRow[]>>(new Map())
  const [plantingsByRow, setPlantingsByRow] = useState<Map<string, Planting[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    listParcels()
      .then(setParcels)
      .catch(() => setParcels([]))
  }, [])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function toggleParcel(parcel: Parcel) {
    const key = `parcel:${parcel.id}`
    if (!expanded.has(key) && !plotsByParcel.has(parcel.id)) {
      const plots = await listPlots(parcel.id).catch(() => [])
      setPlotsByParcel((prev) => new Map(prev).set(parcel.id, plots))
    }
    toggle(key)
  }

  async function togglePlot(plot: Plot) {
    const key = `plot:${plot.id}`
    if (!expanded.has(key) && !rowsByPlot.has(plot.id)) {
      const rows = await listPlotRows(plot.id).catch(() => [])
      setRowsByPlot((prev) => new Map(prev).set(plot.id, rows))
    }
    toggle(key)
  }

  async function saveRowMeasurements(plot: Plot, row: PlotRow, updated: Partial<PlotRow>) {
    try {
      await updatePlotRow(row.id, updated)
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not save these measurements.'
    }
    setRowsByPlot((prev) => {
      const next = new Map(prev)
      next.set(
        plot.id,
        (next.get(plot.id) ?? []).map((r) => (r.id === row.id ? { ...r, ...updated } : r)),
      )
      return next
    })
    return null
  }

  async function toggleRow(plot: Plot, row: PlotRow) {
    const key = `row:${row.id}`
    if (!expanded.has(key) && !plantingsByRow.has(row.id)) {
      const plantings = await listRowPlantings(plot.name, row.number).catch(() => [])
      setPlantingsByRow((prev) => new Map(prev).set(row.id, plantings))
    }
    toggle(key)
  }

  if (parcels === null) return <p className="pdv-empty">Loading...</p>

  return (
    <>
      {parcels.length === 0 && <p className="pdv-empty">No parcels yet.</p>}
      <ul className="pdv-tree" role="tree">
        {parcels.map((parcel) => {
          const pOpen = expanded.has(`parcel:${parcel.id}`)
          const plots = plotsByParcel.get(parcel.id)
          return (
            <li key={parcel.id} role="treeitem" aria-expanded={pOpen}>
              <button type="button" className="pdv-tree-node" onClick={() => toggleParcel(parcel)}>
                <span className={`pdv-tree-caret${pOpen ? ' pdv-tree-caret--open' : ''}`}>&#9656;</span>
                <span className="pdv-tree-label">{parcel.name}</span>
              </button>
              {pOpen && (
                <ul className="pdv-tree" role="group">
                  {plots === undefined && <li className="pdv-empty pdv-tree-indent">Loading...</li>}
                  {plots?.length === 0 && <li className="pdv-empty pdv-tree-indent">No plots yet.</li>}
                  {plots?.map((plot) => {
                    const plOpen = expanded.has(`plot:${plot.id}`)
                    const rows = rowsByPlot.get(plot.id)
                    return (
                      <li key={plot.id} role="treeitem" aria-expanded={plOpen}>
                        <button type="button" className="pdv-tree-node" onClick={() => togglePlot(plot)}>
                          <span className={`pdv-tree-caret${plOpen ? ' pdv-tree-caret--open' : ''}`}>&#9656;</span>
                          <span className="pdv-tree-label">{plot.name}</span>
                        </button>
                        {plOpen && (
                          <ul className="pdv-tree" role="group">
                            {rows === undefined && <li className="pdv-empty pdv-tree-indent">Loading...</li>}
                            {rows?.length === 0 && <li className="pdv-empty pdv-tree-indent">No rows yet.</li>}
                            {rows?.map((row) => {
                              const rOpen = expanded.has(`row:${row.id}`)
                              const plantings = plantingsByRow.get(row.id)
                              return (
                                <li key={row.id} role="treeitem" aria-expanded={rOpen}>
                                  <button type="button" className="pdv-tree-node" onClick={() => toggleRow(plot, row)}>
                                    <span className={`pdv-tree-caret${rOpen ? ' pdv-tree-caret--open' : ''}`}>&#9656;</span>
                                    <span className="pdv-tree-label">Row {row.number}</span>
                                  </button>
                                  {rOpen && (
                                    <ul className="pdv-tree pdv-tree--leaves" role="group">
                                      <li className="pdv-tree-indent">
                                        <RowMeasurements plot={plot} row={row} onSave={saveRowMeasurements} />
                                      </li>
                                      {plantings === undefined && (
                                        <li className="pdv-empty pdv-tree-indent">Loading...</li>
                                      )}
                                      {plantings?.length === 0 && (
                                        <li className="pdv-empty pdv-tree-indent">No active plantings.</li>
                                      )}
                                      {plantings?.map((p) => (
                                        <li key={p.id} role="treeitem">
                                          <button
                                            type="button"
                                            className="pdv-tree-leaf"
                                            onClick={() => onSelectPlanting(p.id)}
                                          >
                                            <span className={`pdv-dot pdv-dot--${plantingStatus(p)}`} />
                                            <span className="pdv-tree-leaf-position">{p.position ?? '—'}</span>
                                            <span className="pdv-tree-leaf-label">{plantingLabel(p)}</span>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
