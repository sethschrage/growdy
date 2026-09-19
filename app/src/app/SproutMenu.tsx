import { useEffect, useRef, useState } from 'react'
import { MenuButton } from '@/app/MenuButton'
import { ChevronIcon, GridIcon, HistoryIcon, PictureIcon, PlusIcon, SearchIcon } from '@/ui/icons'
import { PixelSprout } from '@/ui/pixelArt'

// Tapping the sprout opens a floating menu of features that stand on
// their own outside chat -- see docs/decisions and App's own comment on
// ObservationForm. New features get their own button here, same shape as
// AccountMenu's, anchored off the header's left edge instead of its
// right.
//
// Five icons with no labels is a memory test, and the fix is not a
// drawer: a chevron next to the sprout grows every button into a
// labelled oval in place, so the menu stays where it was and says what
// it does. Collapsed remains the default because most of the time the
// producer is here to read a conversation, not to read a menu.
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
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function close() {
    setOpen(false)
    setExpanded(false)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      // See AccountMenu's identical handler for why this is
      // composedPath() rather than contains(event.target).
      if (ref.current && !event.composedPath().includes(ref.current)) {
        close()
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div className="sprout-menu" ref={ref}>
      <div className="sprout-menu-head">
        <button
          type="button"
          className={`sprout-menu-toggle${open ? ' sprout-menu-toggle--open' : ''}`}
          aria-label="Features"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <PixelSprout size={44} />
        </button>
        {open && (
          <button
            type="button"
            className={`menu-expand${expanded ? ' menu-expand--open' : ''}`}
            aria-label={expanded ? 'Collapse menu labels' : 'Expand menu labels'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronIcon size={16} />
          </button>
        )}
      </div>
      {open && (
        <div
          className={`sprout-menu-bar${expanded ? ' sprout-menu-bar--expanded' : ''}`}
          role="menu"
          aria-label="Features"
        >
          <MenuButton
            label="New observation"
            expanded={expanded}
            onClick={() => {
              onNewObservation()
              close()
            }}
          >
            <PlusIcon size={20} />
          </MenuButton>
          <MenuButton
            label="Observation log"
            expanded={expanded}
            onClick={() => {
              onOpenObservationLog()
              close()
            }}
          >
            <HistoryIcon size={18} />
          </MenuButton>
          <MenuButton
            label="Your vineyard data"
            expanded={expanded}
            onClick={() => {
              onOpenProducerData()
              close()
            }}
          >
            <GridIcon size={20} />
          </MenuButton>
          <MenuButton
            label="Possible observations"
            expanded={expanded}
            onClick={() => {
              onOpenObservationCandidates()
              close()
            }}
          >
            <SearchIcon size={20} />
          </MenuButton>
          <MenuButton
            label="Shared artifacts"
            expanded={expanded}
            onClick={() => {
              onOpenArtifacts()
              close()
            }}
          >
            <PictureIcon size={20} />
          </MenuButton>
        </div>
      )}
    </div>
  )
}
