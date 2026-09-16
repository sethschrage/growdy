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

function plantingStatus(p: Planting): 'planted' | 'blocked' {
  return p.dead_date ? 'blocked' : 'planted'
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
    supabase
      .from('parcels')
      .select('id, name')
      .order('name')
      .then(({ data }) => setParcels((data as Parcel[]) ?? []))
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
      const { data } = await supabase.from('plots').select('id, name').eq('parcel_id', parcel.id).order('name')
      setPlotsByParcel((prev) => new Map(prev).set(parcel.id, (data as Plot[]) ?? []))
    }
    toggle(key)
  }

  async function togglePlot(plot: Plot) {
    const key = `plot:${plot.id}`
    if (!expanded.has(key) && !rowsByPlot.has(plot.id)) {
      const { data } = await supabase.from('plot_rows').select('id, number').eq('plot_id', plot.id).order('number')
      setRowsByPlot((prev) => new Map(prev).set(plot.id, (data as PlotRow[]) ?? []))
    }
    toggle(key)
  }

  async function toggleRow(plot: Plot, row: PlotRow) {
    const key = `row:${row.id}`
    if (!expanded.has(key) && !plantingsByRow.has(row.id)) {
      const { data } = await supabase
        .from('planting_readable')
        .select('id, position, nickname, variety, scion, rootstock, dead_date')
        .eq('plot', plot.name)
        .eq('row_number', row.number)
        .is('removed_date', null)
        .order('position')
      setPlantingsByRow((prev) => new Map(prev).set(row.id, (data as Planting[]) ?? []))
    }
    toggle(key)
  }

  if (parcels === null) return <p className="pdv-empty">Loading...</p>
  if (parcels.length === 0) return <p className="pdv-empty">No parcels yet.</p>

  return (
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
                                    {plantings === undefined && <li className="pdv-empty pdv-tree-indent">Loading...</li>}
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
  )
}
