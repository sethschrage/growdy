import { useEffect, useRef, useState } from 'react'
import { GridIcon, HistoryIcon, PictureIcon, PlusIcon, SearchIcon } from '@/ui/icons'
import { PixelSprout } from '@/ui/pixelArt'

// Tapping the sprout opens a floating menu of features that stand on
// their own outside chat -- see docs/decisions and App's own comment on
// ObservationForm. New features get their own button here, same shape as
// AccountMenu's bar, just anchored off the header's left edge instead of
// its right.
export function SproutMenu({
  onNewObservation,
  onOpenObservationLog,
  onOpenProducerData,
  onOpenObservationCandidates,
  onOpenArtifacts,
}: {
  onNewObservation: () => void
  onOpenObservationLog: () => void
  onOpenProducerData: () => void
  onOpenObservationCandidates: () => void
  onOpenArtifacts: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      // See AccountMenu's identical handler for why this is
      // composedPath() rather than contains(event.target).
      if (ref.current && !event.composedPath().includes(ref.current)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div className="sprout-menu" ref={ref}>
      <button
        type="button"
        className={`sprout-menu-toggle${open ? ' sprout-menu-toggle--open' : ''}`}
        aria-label="Features"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <PixelSprout size={44} />
      </button>
      {open && (
        <div className="sprout-menu-bar" role="menu" aria-label="Features">
          <button
            type="button"
            className="menu-icon-button"
            aria-label="New observation"
            onClick={() => {
              onNewObservation()
              setOpen(false)
            }}
          >
            <PlusIcon size={20} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Observation log"
            onClick={() => {
              onOpenObservationLog()
              setOpen(false)
            }}
          >
            <HistoryIcon size={18} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Your vineyard data"
            onClick={() => {
              onOpenProducerData()
              setOpen(false)
            }}
          >
            <GridIcon size={20} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Possible observations"
            onClick={() => {
              onOpenObservationCandidates()
              setOpen(false)
            }}
          >
            <SearchIcon size={20} />
          </button>
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Shared artifacts"
            onClick={() => {
              onOpenArtifacts()
              setOpen(false)
            }}
          >
            <PictureIcon size={20} />
          </button>
        </div>
      )}
    </div>
  )
}
