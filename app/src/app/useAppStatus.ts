import { useEffect, useState } from 'react'
import { fetchMaintenanceStatus } from '@/data/appStatus'

const CHECK_INTERVAL_MS = 30_000

export type AppBlock = { reason: 'stale' | 'maintenance'; message?: string } | null

// Two independent reasons to stop the app cold and make someone refresh:
// an already-open tab running code from before the latest deploy (version
// stamped into index.html at build time, compared against a fresh fetch of
// it), or a manually-flipped maintenance flag in the database -- both
// checked the same way so one mechanism covers a stale tab and a deliberate
// "block everything while I run risky SQL" window.
export function useAppStatus(): AppBlock {
  const [block, setBlock] = useState<AppBlock>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const [latestVersion, status] = await Promise.all([
        fetch('/', { cache: 'no-store' })
          .then((r) => r.text())
          .then((html) => html.match(/<meta name="app-version" content="([^"]*)"/)?.[1] ?? null)
          .catch(() => null),
        fetchMaintenanceStatus(),
      ])

      if (cancelled) return

      if (status?.maintenance) {
        setBlock({ reason: 'maintenance', message: status.message ?? undefined })
        return
      }

      const currentVersion = import.meta.env.VITE_APP_VERSION
      if (currentVersion && latestVersion && latestVersion !== currentVersion) {
        setBlock({ reason: 'stale' })
        return
      }

      setBlock(null)
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return block
}
