import { useEffect, useRef, useState } from 'react'
import { MenuButton } from '@/app/MenuButton'
import { ChevronIcon, ComposeIcon, ExitIcon, HistoryIcon, NetworkIcon } from '@/ui/icons'
import { PixelBunBottom, PixelBunTop, PixelBurger, PixelToppingRow } from '@/ui/pixelArt'

// The burger comes apart downwards.
//
// It used to spread sideways, with each of its layers turned on its
// side, which meant the icon's own geometry rotated 90 degrees the
// moment you touched it and the menu ran out of screen on a narrow
// phone. Dropping keeps the burger a burger: the toggle holds the top
// bun, the fillings fall out underneath, and the bottom bun lands at
// the end of the stack. It also leaves the whole width of the header
// free, which the sideways version did not.
export function AccountMenu({
  email,
  onNewChat,
  onOpenHistory,
  onOpenDataSources,
  onSignOut,
}: {
  email: string
  onNewChat: () => void
  onOpenHistory: () => void
  onOpenDataSources: () => void
  onSignOut: () => void
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
      // composedPath(), not contains(event.target) -- the toggle button
      // swaps its own icon on this same click (burger -> bun-row), which
      // removes event.target from the DOM before this handler runs. A
      // detached node is never "contained" by anything, even its former
      // parent, so contains() would read every open-click as outside and
      // close the menu immediately. composedPath() is captured at dispatch
      // time, before that swap, so it still reflects the real ancestry.
      if (ref.current && !event.composedPath().includes(ref.current)) {
        close()
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div className="app-menu" ref={ref}>
      <div className="app-menu-head">
        {/* The chevron sits inboard of the toggle, not outboard, because
            this menu hangs off the right edge: anything to the toggle's
            right pushes the bun off the stack it is meant to cap. It was
            38px off. */}
        {open && (
          <button
            type="button"
            className={`menu-expand menu-expand--inward-left${expanded ? ' menu-expand--open' : ''}`}
            aria-label={expanded ? 'Collapse menu labels' : 'Expand menu labels'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="menu-expand-glyph">
              <ChevronIcon size={16} />
            </span>
          </button>
        )}
        {/* Open, the toggle is the burger's own top bun rather than a
            separate close button: the thing you tapped is still there,
            holding the stack up. */}
        <button
          type="button"
          className={`app-menu-toggle${open ? ' app-menu-toggle--open' : ''}`}
          aria-label={open ? 'Close menu' : 'Menu'}
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? <PixelBunTop width={44} className="menu-bun-row" /> : <PixelBurger size={30} />}
        </button>
      </div>
      {open && (
        <div
          className="app-menu-bar"
          role="menu"
          aria-label={`Account menu for ${email}`}
        >
          <PixelToppingRow width={40} className="menu-topping-row" />
          <MenuButton
            label="New chat"
            expanded={expanded}
            onClick={() => {
              onNewChat()
              close()
            }}
          >
            <ComposeIcon size={20} />
          </MenuButton>
          <MenuButton
            label="History"
            expanded={expanded}
            onClick={() => {
              onOpenHistory()
              close()
            }}
          >
            <HistoryIcon size={18} />
          </MenuButton>
          <MenuButton
            label="Knowledge Categories"
            expanded={expanded}
            onClick={() => {
              onOpenDataSources()
              close()
            }}
          >
            <NetworkIcon size={18} />
          </MenuButton>
          <MenuButton
            label="Sign out"
            expanded={expanded}
            onClick={() => {
              onSignOut()
              close()
            }}
          >
            <ExitIcon size={18} />
          </MenuButton>
          {/* The bottom bun closes it. It is the end of the stack, it
              is the obvious thing to tap when you are done, and it was
              decoration until now. */}
          <button
            type="button"
            className="app-menu-close-bun"
            aria-label="Close menu"
            onClick={close}
          >
            <PixelBunBottom width={44} className="menu-bun-row" />
          </button>
        </div>
      )}
    </div>
  )
}
