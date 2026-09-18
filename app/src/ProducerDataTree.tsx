import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

type Parcel = { id: string; name: string; producer_id: string }
type ParcelShare = {
  share_id: string
  party_producer_id: string
  party_name: string
  party_email: string | null
  role: 'editor' | 'viewer'
}
type Plot = { id: string; name: string }
type PlotRow = {
  id: string
  number: number
  length_meters: number | null
  spacing_meters: number | null
  end_post_count: number | null
}
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

function rowMeasurementsSummary(row: PlotRow): string {
  const parts: string[] = []
  if (row.length_meters != null) parts.push(`${row.length_meters}m long`)
  if (row.spacing_meters != null) parts.push(`${row.spacing_meters}m spacing`)
  if (row.end_post_count != null) parts.push(`${row.end_post_count} end posts`)
  return parts.length > 0 ? parts.join(' · ') : 'No measurements recorded'
}

// A row's physical measurements (length, spacing, end-post count) --
// nullable, editor/owner-only (see the plot_rows RLS policy for why a
// viewer share can read but not set these). This is the first editable
// field anywhere in this read-only tree, so it gets its own small inline
// form rather than a shared "edit mode" the rest of the tree doesn't need.
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
      <label>
        Length (m)
        <input type="number" step="any" value={length} onChange={(e) => setLength(e.target.value)} />
      </label>
      <label>
        Spacing (m)
        <input type="number" step="any" value={spacing} onChange={(e) => setSpacing(e.target.value)} />
      </label>
      <label>
        End posts
        <input type="number" step="1" value={endPosts} onChange={(e) => setEndPosts(e.target.value)} />
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

// The only place a producer can add a parcel after onboarding -- the
// wizard (docs/decisions/0026) creates the first one, but skipping that
// step, or wanting a second parcel later, both land here. Uses
// supabase.auth.getUser() rather than a passed-down session prop since
// nothing between here and App already threads one this deep.
function AddParcel({ onAdded }: { onAdded: (parcel: Parcel) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!adding) {
    return (
      <button type="button" className="pdv-add-parcel-toggle" onClick={() => setAdding(true)}>
        + Add parcel
      </button>
    )
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      setError('Not signed in.')
      return
    }
    const { data: profile } = await supabase.from('profiles').select('producer_id').eq('id', user.id).single()
    if (!profile) {
      setSaving(false)
      setError('Could not find your producer.')
      return
    }
    const { data, error } = await supabase
      .from('parcels')
      .insert({ producer_id: profile.producer_id, name: name.trim() })
      .select('id, name, producer_id')
      .single()
    setSaving(false)
    if (error || !data) {
      setError(error?.message ?? 'Something went wrong.')
      return
    }
    onAdded(data as Parcel)
    setName('')
    setAdding(false)
  }

  return (
    <form
      className="pdv-add-parcel-form"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Parcel name"
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <div className="pdv-add-parcel-actions">
        <button type="submit" disabled={saving}>
          Save
        </button>
        <button type="button" onClick={() => setAdding(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// Only ever rendered for a parcel the current producer owns -- 0025's own
// design has just the owner manage who has access, never a share-holder.
// Resolves "the other producer" by their sign-in email through
// share_parcel/get_parcel_shares, since there's no other client-safe way
// to identify them: producers/profiles RLS deliberately blocks a direct
// cross-producer lookup (see the migration these RPCs shipped in).
function ShareParcelPanel({
  parcel,
  shares,
  onChange,
}: {
  parcel: Parcel
  shares: ParcelShare[] | undefined
  onChange: () => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleShare() {
    if (!email.trim()) return
    setSaving(true)
    setError(null)
    const { error } = await supabase.rpc('share_parcel', {
      p_parcel_id: parcel.id,
      p_recipient_email: email.trim(),
      p_role: role,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setEmail('')
    await onChange()
  }

  async function handleRevoke(shareId: string) {
    await supabase.from('parcel_shares').delete().eq('id', shareId)
    await onChange()
  }

  return (
    <div className="pdv-share-panel">
      {shares === undefined && <p className="pdv-empty">Loading...</p>}
      {shares?.length === 0 && <p className="pdv-empty">Not shared with anyone yet.</p>}
      {shares && shares.length > 0 && (
        <ul className="pdv-share-list">
          {shares.map((s) => (
            <li key={s.share_id} className="pdv-share-item">
              <span className="pdv-share-email">{s.party_email ?? s.party_name}</span>
              <span className="pdv-share-role">{s.role}</span>
              <button type="button" className="pdv-share-revoke" onClick={() => handleRevoke(s.share_id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="pdv-share-form"
        onSubmit={(e) => {
          e.preventDefault()
          handleShare()
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Their sign-in email"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button type="submit" disabled={saving}>
          {saving ? 'Sharing...' : 'Share'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
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
  const [myProducerId, setMyProducerId] = useState<string | null>(null)
  const [sharesByParcel, setSharesByParcel] = useState<Map<string, ParcelShare[]>>(new Map())
  const [shareOpen, setShareOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('parcels')
      .select('id, name, producer_id')
      .order('name')
      .then(({ data }) => setParcels((data as Parcel[]) ?? []))
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('producer_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setMyProducerId(data?.producer_id ?? null))
    })
  }, [])

  // Every parcel that isn't mine is one shared with me (the parcels RLS
  // fix that made this cascade actually work is what makes this query
  // return anything at all for those) -- load who shared it and what
  // role I hold, so the badge next to it isn't just "shared," blank.
  useEffect(() => {
    if (!parcels || myProducerId === null) return
    for (const parcel of parcels) {
      if (parcel.producer_id !== myProducerId && !sharesByParcel.has(parcel.id)) {
        supabase
          .rpc('get_parcel_shares', { p_parcel_id: parcel.id })
          .then(({ data }) => setSharesByParcel((prev) => new Map(prev).set(parcel.id, (data as ParcelShare[]) ?? [])))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcels, myProducerId])

  async function loadShares(parcelId: string) {
    const { data } = await supabase.rpc('get_parcel_shares', { p_parcel_id: parcelId })
    setSharesByParcel((prev) => new Map(prev).set(parcelId, (data as ParcelShare[]) ?? []))
  }

  function toggleShare(parcel: Parcel) {
    setShareOpen((prev) => {
      const next = new Set(prev)
      if (next.has(parcel.id)) next.delete(parcel.id)
      else next.add(parcel.id)
      return next
    })
    if (!sharesByParcel.has(parcel.id)) loadShares(parcel.id)
  }

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
      const { data } = await supabase
        .from('plot_rows')
        .select('id, number, length_meters, spacing_meters, end_post_count')
        .eq('plot_id', plot.id)
        .order('number')
      setRowsByPlot((prev) => new Map(prev).set(plot.id, (data as PlotRow[]) ?? []))
    }
    toggle(key)
  }

  async function saveRowMeasurements(plot: Plot, row: PlotRow, updated: Partial<PlotRow>) {
    const { error } = await supabase.from('plot_rows').update(updated).eq('id', row.id)
    if (error) return error.message
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

  return (
    <>
      <AddParcel onAdded={(parcel) => setParcels((prev) => [...(prev ?? []), parcel])} />
      {parcels.length === 0 && <p className="pdv-empty">No parcels yet.</p>}
      <ul className="pdv-tree" role="tree">
        {parcels.map((parcel) => {
          const pOpen = expanded.has(`parcel:${parcel.id}`)
          const plots = plotsByParcel.get(parcel.id)
          const isMine = myProducerId !== null && parcel.producer_id === myProducerId
          const shares = sharesByParcel.get(parcel.id)
          return (
            <li key={parcel.id} role="treeitem" aria-expanded={pOpen}>
              <div className="pdv-tree-node-row">
                <button type="button" className="pdv-tree-node" onClick={() => toggleParcel(parcel)}>
                  <span className={`pdv-tree-caret${pOpen ? ' pdv-tree-caret--open' : ''}`}>&#9656;</span>
                  <span className="pdv-tree-label">{parcel.name}</span>
                </button>
                {isMine ? (
                  <button type="button" className="pdv-share-trigger" onClick={() => toggleShare(parcel)}>
                    Share
                  </button>
                ) : (
                  shares?.[0] && (
                    <span className="pdv-shared-badge">
                      Shared by {shares[0].party_name} · {shares[0].role}
                    </span>
                  )
                )}
              </div>
              {isMine && shareOpen.has(parcel.id) && (
                <ShareParcelPanel parcel={parcel} shares={shares} onChange={() => loadShares(parcel.id)} />
              )}
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
