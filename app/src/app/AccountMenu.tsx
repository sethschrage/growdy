import { useEffect, useRef, useState } from 'react'
import {
  PixelBunSlice,
  PixelBurger,
  PixelCompose,
  PixelExit,
  PixelHistory,
  PixelNetwork,
  PixelToppingSlice,
} from '@/ui/icons'

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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      // composedPath(), not contains(event.target) -- the toggle button
      // swaps its own icon on this same click (burger -> bun-slice), which
      // removes event.target from the DOM before this handler runs. A
      // detached node is never "contained" by anything, even its former
      // parent, so contains() would read every open-click as outside and
      // close the menu immediately. composedPath() is captured at dispatch
      // time, before that swap, so it still reflects the real ancestry.
      if (ref.current && !event.composedPath().includes(ref.current)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div className="app-menu" ref={ref}>
      <button
        type="button"
        className="app-menu-toggle"
        aria-label={open ? 'Close menu' : 'Menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Open state shows the bar's own trailing bun-slice instead of
            the closed burger -- the toggle IS that last bun once the
            burger's "layers" have spread out, not a separate rotated
            icon sitting next to them. The bar itself only draws the
            leading bun-slice now; this is the trailing one. */}
        {open ? <PixelBunSlice className="menu-bun" /> : <PixelBurger size={30} />}
      </button>
      {open && (
        <div className="app-menu-bar" role="menu" aria-label={`Account menu for ${email}`}>
          <PixelBunSlice className="menu-bun" />
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
            aria-label="New chat"
            onClick={() => {
              onNewChat()
              setOpen(false)
            }}
          >
            <PixelCompose size={22} />
          </button>
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
            aria-label="History"
            onClick={() => {
              onOpenHistory()
              setOpen(false)
            }}
          >
            <PixelHistory size={18} />
          </button>
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Knowledge Categories"
            onClick={() => {
              onOpenDataSources()
              setOpen(false)
            }}
          >
            <PixelNetwork size={18} />
          </button>
          <PixelToppingSlice className="menu-topping" />
          <button
            type="button"
            className="menu-icon-button"
            aria-label="Sign out"
            onClick={() => {
              onSignOut()
              setOpen(false)
            }}
          >
            <PixelExit size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
