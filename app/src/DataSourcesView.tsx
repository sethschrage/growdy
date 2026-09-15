import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { useDataSources, type DataProvider, type DataSource } from './useDataSources'

function AddSourceForm({ providers, onAdded }: { providers: DataProvider[]; onAdded: () => void }) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '')
  const [name, setName] = useState('')
  const [externalId, setExternalId] = useState('')
  const [secret, setSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!providerId || !name.trim() || !externalId.trim() || !secret.trim()) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.functions.invoke('add-weather-source', {
      body: { provider_id: providerId, name, station_id: externalId, secret },
    })
    setSubmitting(false)
    if (error) {
      let message = error.message
      try {
        const body = await error.context.json()
        if (body?.error) message = body.error
      } catch {
        // error.context wasn't a JSON response -- fall back to error.message
      }
      setError(message)
      return
    }
    setName('')
    setExternalId('')
    setSecret('')
    onAdded()
  }

  return (
    <form className="data-source-form" onSubmit={handleSubmit}>
      <h3>Add a channel</h3>
      <label>
        Provider
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.category} / {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Station" />
      </label>
      <label>
        Station ID
        <input value={externalId} onChange={(e) => setExternalId(e.target.value)} />
      </label>
      <label>
        API key
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding...' : 'Add channel'}
      </button>
    </form>
  )
}

function SourceRow({ source, onChanged }: { source: DataSource; onChanged: () => void }) {
  async function toggle() {
    await supabase.from('data_sources').update({ enabled: !source.enabled }).eq('id', source.id)
    onChanged()
  }

  async function remove() {
    await supabase.from('data_sources').delete().eq('id', source.id)
    onChanged()
  }

  return (
    <li className="data-source-item">
      <div className="data-source-item-header">
        <span className="data-source-name">{source.name}</span>
        <button
          type="button"
          onClick={toggle}
          className={`data-source-toggle${source.enabled ? ' data-source-toggle--on' : ''}`}
        >
          {source.enabled ? 'On' : 'Off'}
        </button>
      </div>
      <div className="data-source-status">
        {source.backfill_status && source.backfill_status !== 'complete' && <p>Backfilling history...</p>}
        {source.last_synced_at && <p>Last synced {new Date(source.last_synced_at).toLocaleString()}</p>}
        {!source.last_synced_at && !source.backfill_status && <p>Not synced yet.</p>}
        {source.last_error && <p className="error">{source.last_error}</p>}
        {source.last_warning && <p className="warning">{source.last_warning}</p>}
      </div>
      <div className="data-source-actions">
        <button type="button" onClick={remove} className="data-source-remove">
          Remove
        </button>
      </div>
    </li>
  )
}

// Genuinely full-screen (inset: 0), not HistoryDrawer's side-panel
// treatment -- see docs/decisions/0019.
export function DataSourcesView({ onClose }: { session: Session; onClose: () => void }) {
  const { providers, sources, refresh } = useDataSources()

  return (
    <div className="data-sources-overlay">
      <div className="data-sources-header">
        <h2>Data Channels</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="data-sources-close">
          &times;
        </button>
      </div>
      <div className="data-sources-body">
        {sources === null && <p className="history-empty">Loading...</p>}
        {sources?.length === 0 && <p className="history-empty">No channels added yet.</p>}
        <ul className="data-source-list">
          {sources?.map((s) => (
            <SourceRow key={s.id} source={s} onChanged={refresh} />
          ))}
        </ul>
        {providers && providers.length > 0 && <AddSourceForm providers={providers} onAdded={refresh} />}
      </div>
    </div>
  )
}
