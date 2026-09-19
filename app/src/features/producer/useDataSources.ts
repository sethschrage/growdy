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

  async function refresh() {
    const [providerRows, sourceRows] = await Promise.all([
      listProviders().catch(() => []),
      listSources().catch(() => []),
    ])
    setProviders(providerRows)
    setSources(sourceRows)
  }

  useEffect(() => {
    refresh()
  }, [])

  return { providers, sources, refresh }
}
