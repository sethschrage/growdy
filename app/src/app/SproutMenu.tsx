import { useEffect, useRef, useState } from 'react'
import { PixelSprout } from '@/ui/pixelArt'

// The sprout opens, and at the moment it opens onto nothing.
//
// It held five features that stand on their own outside chat -- the
// observation form, the log, the candidate queue, the vineyard browser,
// the artifacts. They are all in AccountMenu now, because two menus is
// two places to look for one thing and there was no rule saying which
// was which: "we don't have a definitive use case for the sprout menu
// yet and so might as well put everything in one place."
//
// Kept rather than deleted, deliberately. The sprout is the app's own
// mark in the corner of the header, the open/close machinery works, and
// the moment there is a reason for a second menu -- a map, a season, a
// thing that belongs to the vineyard rather than to the account -- this
// is where it goes. An empty menu that opens is a strange thing to ship;
// it is here on the understanding that the next feature fills it, and if
// that has not happened it should be deleted rather than left.
export function SproutMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function close() {
    setOpen(false)
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
      </div>

    </div>
  )
}
