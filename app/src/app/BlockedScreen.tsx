import type { AppBlock } from '@/app/useAppStatus'
import { PixelSprout } from '@/ui/pixelArt'

export function BlockedScreen({ block }: { block: NonNullable<AppBlock> }) {
  return (
    <div className="login-screen">
      <div className="login-content">
        <span className="app-icon" role="img" aria-label="growdy">
          <PixelSprout size={56} />
        </span>
        <h1>growdy</h1>
        {block.reason === 'maintenance' ? (
          <p>{block.message ?? 'Down for maintenance -- back shortly.'}</p>
        ) : (
          <>
            <p>A new version is available.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </>
        )}
      </div>
    </div>
  )
}
