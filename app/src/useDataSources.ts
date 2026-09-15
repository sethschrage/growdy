import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

export type DataProvider = {
  id: string
  category: string
  name: string
  enabled: boolean
}

export type DataSource = {
  id: string
  provider_id: string
  name: string
  external_id: string
  enabled: boolean
  backfill_status: 'pending' | 'in_progress' | 'complete' | null
  last_synced_at: string | null
  last_error: string | null
  last_warning: string | null
}

// Fetch-on-mount, refreshed imperatively after a mutation -- same shape as
// HistoryDrawer's own data fetch, not a polling hook like useAppStatus,
// since nothing here changes on its own between explicit user actions
// (add, toggle, sync) -- see docs/decisions/0019.
export function useDataSources() {
  const [providers, setProviders] = useState<DataProvider[] | null>(null)
  const [sources, setSources] = useState<DataSource[] | null>(null)

  async function refresh() {
    const [{ data: providerRows }, { data: sourceRows }] = await Promise.all([
      supabase.from('data_providers').select('id, category, name, enabled').eq('enabled', true),
      supabase
        .from('data_sources')
        .select(
          'id, provider_id, name, external_id, enabled, backfill_status, last_synced_at, last_error, last_warning',
        )
        .order('created_at', { ascending: false }),
    ])
    setProviders((providerRows as DataProvider[]) ?? [])
    setSources((sourceRows as DataSource[]) ?? [])
  }

  useEffect(() => {
    refresh()
  }, [])

  return { providers, sources, refresh }
}
