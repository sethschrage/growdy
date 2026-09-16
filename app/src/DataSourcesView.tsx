import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { useDataSources, type DataProvider, type DataSource, type DeviceLocationConfig } from './useDataSources'

function AddSourceForm({ provider, onAdded }: { provider: DataProvider; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [externalId, setExternalId] = useState('')
  const [secret, setSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !externalId.trim() || !secret.trim()) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.functions.invoke('add-weather-source', {
      body: { provider_id: provider.id, name, station_id: externalId, secret },
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
      <h3>Add a {provider.name} source</h3>
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
        {submitting ? 'Adding...' : 'Add source'}
      </button>
    </form>
  )
}

// "Device" is a permission grant + a live reading, not a credentialed
// external API -- add_data_source accepts no secret for it (see
// 20260915152830_add_data_source_secret_optional.sql), and there's
// nothing to backfill. One row per producer for now; a second geolocation
// provider (Trimble, an external receiver) will need its own panel shape
// once it exists, since a hardware receiver's connection flow won't look
// like a permission prompt.
function DeviceLocationPanel({
  provider,
  source,
  onChanged,
}: {
  provider: DataProvider
  source: DataSource | null
  onChanged: () => void
}) {
  const [status, setStatus] = useState<PermissionState | 'unsupported'>('unsupported')
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!navigator.permissions?.query) return
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (!cancelled) setStatus(result.state)
      })
      .catch(() => {
        // Querying the 'geolocation' permission isn't supported in this
        // browser -- status stays 'unsupported' until Enable is pressed.
      })
    return () => {
      cancelled = true
    }
  }, [])

  function enable() {
    setRequesting(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setStatus('granted')
        const config: DeviceLocationConfig = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          captured_at: new Date().toISOString(),
        }
        if (source) {
          await supabase.from('data_sources').update({ config }).eq('id', source.id)
        } else {
          await supabase.rpc('add_data_source', {
            p_provider_id: provider.id,
            p_name: 'This device',
            p_external_id: 'device',
            p_config: config,
          })
        }
        setRequesting(false)
        onChanged()
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : status)
        setError(err.message)
        setRequesting(false)
      },
    )
  }

  const config = (source?.config ?? null) as DeviceLocationConfig | null
  const statusLabel =
    status === 'granted' ? 'Granted' : status === 'denied' ? 'Denied' : status === 'prompt' ? 'Not requested yet' : 'Unknown'

  return (
    <div className="data-source-form">
      <h3>Device location</h3>
      <p className="data-source-status-line">Permission: {statusLabel}</p>
      {config && (
        <p className="data-source-status-line">
          Last known: {config.latitude.toFixed(5)}, {config.longitude.toFixed(5)} ({new Date(config.captured_at).toLocaleString()})
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={enable} disabled={requesting}>
        {requesting ? 'Locating...' : config ? 'Refresh location' : 'Enable device location'}
      </button>
    </div>
  )
}

// USA National Phenology Network is one shared public dataset, identical
// for every producer -- no personal account, no station, no credential to
// enter (confirmed against USA-NPN's own docs: access is honor-system, a
// plain request_source string, not a key). Nothing here needs its own
// name/id/secret fields -- there's exactly one thing to toggle on. The
// chat's get_grape_phenology tool checks this same enabled row before
// querying USA-NPN, so the toggle actually controls something rather
// than being UI with no effect.
function EnableProviderPanel({
  provider,
  source,
  onChanged,
}: {
  provider: DataProvider
  source: DataSource | null
  onChanged: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enable() {
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.rpc('add_data_source', {
      p_provider_id: provider.id,
      p_name: provider.name,
      p_external_id: 'default',
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    onChanged()
  }

  if (source) {
    return (
      <ul className="data-source-list">
        <SourceRow source={source} onChanged={onChanged} />
      </ul>
    )
  }

  return (
    <div className="data-source-form">
      <h3>{provider.name}</h3>
      <p className="data-source-status-line">A shared public dataset -- no account or credential needed, just enable it.</p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={enable} disabled={submitting}>
        {submitting ? 'Enabling...' : `Enable ${provider.name}`}
      </button>
    </div>
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
//
// Three-level drill-down (category -> provider -> its sources), matching
// docs/decisions/0019's own Category/Provider/Source taxonomy instead of
// flattening straight to a picker inside the add-source form -- a
// producer with more than one provider in a category (or more categories
// once a second one exists) navigates the same shape the data actually
// has, rather than reading it off a "category / name" string in a
// dropdown.
export function DataSourcesView({ onClose }: { session: Session; onClose: () => void }) {
  const { providers, sources, refresh } = useDataSources()
  const [category, setCategory] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<string | null>(null)

  const categories = providers ? [...new Set(providers.map((p) => p.category))] : []
  const categoryProviders = providers?.filter((p) => p.category === category) ?? []
  const provider = providers?.find((p) => p.id === providerId) ?? null
  const providerSources = sources?.filter((s) => s.provider_id === providerId) ?? []

  const title = provider ? provider.name : category ? category : 'Knowledge Categories'

  return (
    <div className="data-sources-overlay">
      <div className="data-sources-header">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="data-sources-close">
          &times;
        </button>
      </div>
      <div className="data-sources-body">
        {providerId ? (
          <button type="button" className="data-sources-back" onClick={() => setProviderId(null)}>
            &larr; {category}
          </button>
        ) : category ? (
          <button type="button" className="data-sources-back" onClick={() => setCategory(null)}>
            &larr; Categories
          </button>
        ) : null}

        {providers === null && <p className="history-empty">Loading...</p>}

        {providers && !category && (
          <ul className="data-source-list">
            {categories.length === 0 && <p className="history-empty">No categories yet.</p>}
            {categories.map((c) => (
              <li key={c}>
                <button type="button" className="data-source-nav-item" onClick={() => setCategory(c)}>
                  {c}
                </button>
              </li>
            ))}
          </ul>
        )}

        {category && !provider && (
          <ul className="data-source-list">
            {categoryProviders.length === 0 && <p className="history-empty">No providers in this category yet.</p>}
            {categoryProviders.map((p) => (
              <li key={p.id}>
                <button type="button" className="data-source-nav-item" onClick={() => setProviderId(p.id)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {provider && provider.name === 'Device' && (
          <DeviceLocationPanel provider={provider} source={providerSources[0] ?? null} onChanged={refresh} />
        )}

        {provider && provider.name === 'USA National Phenology Network' && (
          <EnableProviderPanel provider={provider} source={providerSources[0] ?? null} onChanged={refresh} />
        )}

        {provider && provider.name === 'Anthropic Web Search' && (
          <div className="data-source-form">
            <h3>{provider.name}</h3>
            <p className="data-source-status-line">
              Always available -- the chat can search and fetch real web content whenever a question needs it. No
              setup, and nothing to turn off; each search is small and capped per reply.
            </p>
          </div>
        )}

        {provider && provider.name !== 'Device' && provider.name !== 'USA National Phenology Network' && provider.name !== 'Anthropic Web Search' && (
          <>
            {sources === null && <p className="history-empty">Loading...</p>}
            {sources !== null && providerSources.length === 0 && <p className="history-empty">No sources added yet.</p>}
            <ul className="data-source-list">
              {providerSources.map((s) => (
                <SourceRow key={s.id} source={s} onChanged={refresh} />
              ))}
            </ul>
            <AddSourceForm provider={provider} onAdded={refresh} />
          </>
        )}
      </div>
    </div>
  )
}
