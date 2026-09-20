import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  isTap,
  recallLabelWidth,
  rememberLabelWidth,
  widthAfterTap,
  widthFromDrag,
} from '@/app/labelDrag'
import { MenuButton } from '@/app/MenuButton'
import {
  ChevronIcon,
  ComposeIcon,
  ExitIcon,
  GridIcon,
  HistoryIcon,
  NetworkIcon,
  PictureIcon,
  PlusIcon,
  SearchIcon,
} from '@/ui/icons'
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
/**
 * The menu's own animation length, read from the stylesheet that uses
 * it. The close has to outlast the exit animation, and a second copy of
 * "340" in here is a second thing to remember when somebody retimes the
 * menu -- which has already happened twice.
 */
function menuSpeedMs(): number {
  const declared = getComputedStyle(document.documentElement).getPropertyValue('--menu-speed')
  const parsed = Number.parseFloat(declared)
  if (Number.isNaN(parsed)) return 340
  return declared.trim().endsWith('ms') ? parsed : parsed * 1000
}

export function AccountMenu({
  email,
  covered,
  onNewChat,
  onOpenHistory,
  onOpenDataSources,
  onSignOut,
  onNewObservation,
  onOpenObservationLog,
  onOpenProducerData,
  onOpenObservationCandidates,
  onOpenArtifacts,
}: {
  email: string
  /** True while one of the screens these buttons open is on top of it. */
  covered: boolean
  onNewChat: () => void
  onOpenHistory: () => void
  onOpenDataSources: () => void
  onSignOut: () => void
  onNewObservation: () => void
  onOpenObservationLog: () => void
  onOpenProducerData: () => void
  onOpenObservationCandidates: () => void
  onOpenArtifacts: () => void
}) {
  const [open, setOpen] = useState(false)
  // Opens saying what it does, the first time. Collapsed-by-default was
  // a guess that the producer is usually here to read a conversation
  // rather than a menu, and it cost them a memory test every time it
  // turned out to be wrong. Nine unlabelled circles is a worse default
  // than a wider menu.
  //
  // After that it opens where they left it. Collapsing the labels is a
  // choice about how they want the menu, not about this one opening of
  // it, and re-collapsing every time was the app overruling them.
  //
  // A width rather than a flag, because the handle beside the stack is
  // draggable: anywhere between circles and full labels is a state the
  // producer can choose and the menu has to be able to hold.
  const [labelWidth, setLabelWidth] = useState(recallLabelWidth)
  const [dragging, setDragging] = useState(false)
  // Shutting takes as long as opening did. Closing used to be instant --
  // the menu simply stopped existing -- which after the drop was built
  // to be watched read as the whole thing being yanked away.
  const [closing, setClosing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const expanded = labelWidth > 0

  function close() {
    // A second close during the animation (an outside tap while it is
    // already going) must not stack another timer on the first.
    if (closing) return
    setClosing(true)
    window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, menuSpeedMs())
  }

  /**
   * Drag the handle to set how wide the labels are; tap it to go all the
   * way one way or the other.
   *
   * Pointer capture rather than listeners on the window: the finger
   * leaves the 44px handle almost immediately on a drag of any length,
   * and without capture the gesture dies the moment it does.
   */
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX
    const startWidth = labelWidth
    let furthest = 0
    setDragging(true)

    // Listeners on the window, not pointer capture on the handle.
    // Capture was set on the rail, which carries `pointer-events: none`
    // so that taps around the grip fall through to the sky and dismiss
    // the menu -- and an element that takes no pointer events is a poor
    // place to send the rest of a gesture. On a phone the sequence
    // simply stopped arriving. The window always gets them.
    // Tracked here rather than read back out of state at the end: the
    // width it settles on has to be written to storage as well as to
    // React, and a state updater is not the place to do anything that
    // touches the world outside it.
    let settled = startWidth
    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      furthest = Math.max(furthest, Math.abs(deltaX))
      settled = widthFromDrag(startWidth, deltaX, 'left')
      setLabelWidth(settled)
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDragging(false)
      // A tap that wandered a few pixels is still a tap, and it goes all
      // the way rather than leaving the menu at whatever width the
      // wobble happened to land on.
      if (isTap(furthest)) settled = widthAfterTap(startWidth)
      setLabelWidth(settled)
      // Remembered at the end of the gesture, not during it: a write per
      // pointermove is a hundred writes for one decision.
      rememberLabelWidth(settled)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // The handler below is registered once per open and would otherwise
  // hold the `close` from that render -- which reads `closing` to decide
  // whether a close is already running. A stale one sees `closing:
  // false` forever and starts a second timer on every outside tap.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    // Not while a screen is over it. The menu stays open behind whatever
    // it opened, so that closing that screen hands the producer the menu
    // back -- and every tap inside the screen is, geometrically, a tap
    // outside the menu.
    if (!open || covered) return
    function handleClick(event: PointerEvent) {
      // composedPath(), not contains(event.target) -- the toggle button
      // swaps its own icon on this same click (burger -> bun-row), which
      // removes event.target from the DOM before this handler runs. A
      // detached node is never "contained" by anything, even its former
      // parent, so contains() would read every open-click as outside and
      // close the menu immediately. composedPath() is captured at dispatch
      // time, before that swap, so it still reflects the real ancestry.
      if (ref.current && !event.composedPath().includes(ref.current)) {
        closeRef.current()
      }
    }
    // pointerdown, not click. On iOS a tap on an element that is not
    // natively interactive -- the sky, a message, a plain div -- does
    // not reliably produce a click that reaches the document, so the
    // dismiss worked on a trackpad and did nothing on a phone.
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [open, covered])

  return (
    <div className="app-menu" ref={ref}>
      <div className="app-menu-head">
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
          {open ? (
            <PixelBunTop className="menu-bun-row" />
          ) : (
            <PixelBurger size={44} />
          )}
        </button>
      </div>
      {open && (
        <div
          className={`app-menu-bar${dragging ? ' app-menu-bar--dragging' : ''}${closing ? ' app-menu-bar--closing' : ''}`}
          style={{ '--label-width': `${labelWidth}px` } as React.CSSProperties}
          role="menu"
          aria-label={`Account menu for ${email}`}
        >
          {/* Two of these ten shut the menu and eight do not, and the
              line between them is whether the menu would be in the way.
              The eight open a screen over the top of it, so it stays
              open underneath and shutting that screen returns the
              producer to the menu they were using -- going from the
              observation log to the vineyard data used to mean opening
              the burger again in between. These two change what is
              behind the menu rather than covering it, so leaving it open
              would leave it sitting on the thing it just asked for. */}
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
            }}
          >
            <HistoryIcon size={18} />
          </MenuButton>
          <MenuButton
            label="New observation"
            expanded={expanded}
            onClick={() => {
              onNewObservation()
            }}
          >
            <PlusIcon size={20} />
          </MenuButton>
          <MenuButton
            label="Observation log"
            expanded={expanded}
            onClick={() => {
              onOpenObservationLog()
            }}
          >
            <HistoryIcon size={18} />
          </MenuButton>
          <MenuButton
            label="Possible observations"
            expanded={expanded}
            onClick={() => {
              onOpenObservationCandidates()
            }}
          >
            <SearchIcon size={20} />
          </MenuButton>
          <MenuButton
            label="Your vineyard data"
            expanded={expanded}
            onClick={() => {
              onOpenProducerData()
            }}
          >
            <GridIcon size={20} />
          </MenuButton>
          <MenuButton
            label="Shared artifacts"
            expanded={expanded}
            onClick={() => {
              onOpenArtifacts()
            }}
          >
            <PictureIcon size={20} />
          </MenuButton>
          <MenuButton
            label="Knowledge Categories"
            expanded={expanded}
            onClick={() => {
              onOpenDataSources()
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
          {/* The foot of the stack: the heel that closes the menu, and
              the chevron that grows the labels, side by side.

              The heel is flush to the right edge because that is the
              edge this menu hangs off and a bun that is not flush is not
              capping anything. The chevron is inboard of it -- the same
              relation it had to the toggle when it lived in the head,
              and the reason is the same, that anything to the bun's
              right pushes the bun off the stack.

              The chevron is down here rather than up in the head because
              up there the expanded ovals ran through it: shell.css, on
              .app-menu-foot, has the measurements and the three
              alternatives that were rejected. */}
          {/* Beside the stack, halfway down it: out of the ovals' way
              because it is outside the column entirely, and next to the
              thing it acts on rather than parked at one end of it. It
              rides the column's left edge, so expanding the labels
              carries it left with them. */}
          {/* The control is the rail itself, and there is no button.
              A brown circle beside a column of brown circles reads as a
              tenth menu item whatever shape it is -- and it was a 44px
              target that moves as the column resizes, so it felt dead
              even when it fired. A translucent grabber reads as a thing
              you pull, which is what it is: drag it to set how wide the
              labels are, tap it to go all the way.

              It runs the length of the stack because it governs the
              whole stack. A handle beside one button belongs to that
              button. */}
          <button
            type="button"
            className="menu-rail"
            aria-label={expanded ? 'Collapse menu labels' : 'Expand menu labels'}
            aria-expanded={expanded}
            onPointerDown={startDrag}
          >
            {/* The line breaks where the grip is, the way a handle sits
                in a rail rather than on top of one. The whole rail is
                the target, not the grip: 44px that moved as the column
                resized was the "unresponsive" one. */}
            <span className="menu-rail-line" aria-hidden="true" />
            <span
              className={`menu-grip${expanded ? ' menu-grip--open' : ''}`}
              aria-hidden="true"
            >
              <ChevronIcon size={20} />
            </span>
            <span className="menu-rail-line" aria-hidden="true" />
          </button>
          <div className="app-menu-foot">
            {/* The heel is the burger's own, and decoration again: as a
                button it took the app's green chrome and looked like a
                control that had escaped from the compose bar. */}
            {/* The fillings fall, which is what taking a burger apart
                looks like. They used to cap the stack, directly under
                the crown, which kept the closed icon's order but meant
                the one part of the burger that moves didn't. Landing on
                the heel they read as having slid down the whole stack,
                and the stack itself is the meat. */}
            <PixelToppingRow className="menu-topping-row" />
            <span className="app-menu-heel" aria-hidden="true">
              <PixelBunBottom className="menu-bun-row" />
            </span>
            {/* Closing is its own small piece of glass, pointing the way
                the menu goes when it shuts. Same material as the rail,
                because it is the same kind of thing: chrome, not
                burger. */}
            <button
              type="button"
              className="menu-close-grip"
              aria-label="Close menu"
              onClick={close}
            >
              <ChevronIcon size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
