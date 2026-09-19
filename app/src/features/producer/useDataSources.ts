import { useEffect, useState } from 'react'
import {
  listProviders,
  listSources,
  type DataProvider,
  type DataSource,
  type DeviceLocationConfig,
} from '@/data/dataSources'

export type { DataProvider, DataSource, DeviceLocationConfig }

// Fetch-on-mount, refreshed imperatively after a mutation -- same shape as
// HistoryDrawer's own data fetch, not a polling hook like useAppStatus,
// since nothing here changes on its own between explicit user actions
// (add, toggle, sync) -- see docs/decisions/0019.
export function useDataSources() {
  const [providers, setProviders] = useState<DataProvider[] | null>(null)
  const [sources, setSources] = useState<DataSource[] | null>(null)

  async function load() {
    return Promise.all([listProviders().catch(() => []), listSources().catch(() => [])])
  }

  // The imperative path, after an add, a toggle or a delete.
  async function refresh() {
    const [providerRows, sourceRows] = await load()
    setProviders(providerRows)
    setSources(sourceRows)
  }

  // The mount path, which needs the cancellation guard the imperative
  // one doesn't: this overlay is closed by tapping outside it, so a slow
  // read can very easily land after the component is gone.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [providerRows, sourceRows] = await load()
      if (cancelled) return
      setProviders(providerRows)
      setSources(sourceRows)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { providers, sources, refresh }
}
